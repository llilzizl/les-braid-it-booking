// Les Braid It: custom-requests
// Handles the whole custom style request workflow:
//
//   submit          The booking page sends a request (form fields + photo).
//                   The photo goes into the private "custom-requests" bucket,
//                   the request is saved, and you and the client are emailed.
//   respond         You answer from admin.html (admin login required):
//                     offer    accept as asked, or suggest a new price, deposit,
//                              length, date or time. Holds the slot and emails
//                              the client a link to their request page.
//                     message  a comment or question only
//                     decline
//   reply           The client answers you from their request page.
//   client_decline  The client turns the offer down.
//   checkout        The client pays the deposit (this accepts the offer).
//                   The existing stripe-webhook function confirms the booking.
//
// Secrets (Supabase > Edge Functions > Secrets). These are the same ones the
// other two functions already use, so nothing new is needed:
//   STRIPE_SECRET_KEY, SITE_URL, BREVO_API_KEY, EMAIL_FROM
// Optional: EMAIL_FROM_NAME, OWNER_EMAIL, ALLOWED_ORIGINS,
//   CUSTOM_HOLD_HOURS (how long an accepted slot is held, default 48)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are added by Supabase.
// Turn "Verify JWT" OFF for this function (guests are not logged in).
// The respond action checks for an admin login itself.

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type RpcResult = { data: any; error: { message: string } | null };
export interface Mail { to: { email: string; name?: string }; subject: string; html: string; text: string }

export interface Deps {
  env: (key: string) => string | undefined;
  rpc: (fn: string, args: Json) => Promise<RpcResult>;
  uploadPhoto: (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  removePhoto: (path: string) => Promise<void>;
  userFromToken: (token: string) => Promise<string | null>;
  isAdmin: (userId: string) => Promise<boolean>;
  createSession: (params: Json) => Promise<{ id: string; url: string | null }>;
  expireSession: (sessionId: string) => Promise<void>;
  attachSession: (bookingId: string, sessionId: string) => Promise<void>;
  sendEmail?: (mail: Mail) => Promise<void>;   // missing = emails not set up
  newId: () => string;
  now?: () => Date;
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};

const ERRORS: Record<string, [number, string]> = {
  invalid_details: [400, "Please check your name, email and phone number."],
  invalid_description: [400, "Please describe the style you want (up to 2,000 characters)."],
  invalid_duration: [400, "Please choose how long the style will take."],
  invalid_price: [400, "Please check the price."],
  invalid_deposit: [400, "The deposit must be more than £0 and no more than the price."],
  invalid_time: [400, "That time is not available. Please choose another."],
  invalid_hold: [400, "The hold time is not valid."],
  date_unavailable: [409, "That day is not available. Please choose another."],
  slot_taken: [409, "Sorry, that time has just been taken. Please choose another."],
  too_many_requests: [429, "You have already sent 3 requests today. I'll get back to you on those first."],
  not_found: [404, "This request could not be found."],
  already_accepted: [409, "This request is already accepted and waiting for the deposit."],
  already_answered: [409, "This request has already been answered."],
  already_paid: [409, "This deposit has already been paid. You're booked in!"],
  not_available: [409, "This request is no longer available to book. Please get in touch."],
  invalid_message: [400, "Please write a message (up to 2,000 characters)."],
  too_many_messages: [429, "You've sent a lot of messages today. I'll reply to those first."],
  hold_expired: [410, "Sorry, the time to pay this deposit has run out, so the slot was released. Please get in touch or send a new request."],
};

/* ---------------- Small helpers ---------------- */
export const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function prettyWhen(date: string, time: string): string {
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  const [hh, mm] = String(time).slice(0, 5).split(":").map(Number);
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const hour = hh % 12 === 0 ? 12 : hh % 12;
  const clock = hour + (mm ? ":" + String(mm).padStart(2, "0") : "") + (hh < 12 ? "am" : "pm");
  return `${day} ${d} ${MONTHS[m - 1]} ${y} at ${clock}`;
}

export function prettyLength(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m} mins`;
  return `${h} hr${h === 1 ? "" : "s"}${m ? ` ${m} mins` : ""}`;
}

const pounds = (n: number) => "£" + (Number.isInteger(n) ? n : n.toFixed(2));
const firstName = (name: string) => String(name || "").trim().split(/\s+/)[0] || "there";

function emailShell(title: string, intro: string, rows: [string, string][], after: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f1f2;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;border-top:4px solid #e8558e" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 26px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e8558e">Les Braid It</p>
<h1 style="margin:0 0 14px;font-size:26px;font-style:italic;font-family:Georgia,serif">${esc(title)}</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5">${intro}</p>
${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eadde2;border-radius:10px">
${rows.map(([k, v]) => `<tr><td style="padding:10px 14px;font-size:13px;color:#6b5f64;width:38%;border-bottom:1px solid #f1e8eb">${esc(k)}</td><td style="padding:10px 14px;font-size:15px;font-weight:600;border-bottom:1px solid #f1e8eb">${esc(v)}</td></tr>`).join("")}
</table>` : ""}
${after}
</td></tr></table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:22px 0 4px"><a href="${esc(href)}" style="display:inline-block;background:#e8558e;color:#160a10;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:14px;padding:14px 28px;border-radius:999px">${esc(label)}</a></p>`;

/* ---------------- Emails ---------------- */
export interface RequestDetails {
  name: string; email: string; phone: string; description: string;
  duration: number; price: number | null; date: string; time: string;
}

export function requestReceivedEmail(r: RequestDetails) {
  const rows: [string, string][] = [
    ["Preferred time", prettyWhen(r.date, r.time)],
    ["Length", prettyLength(r.duration)],
  ];
  if (r.price != null) rows.push(["Your suggested price", pounds(r.price)]);
  const intro = `Hi ${esc(firstName(r.name))}, thank you for your custom style request. I'll look at your photo and details and get back to you within 24-48 hours.`;
  const after = `<p style="margin:18px 0 0;font-size:14px;line-height:1.5;color:#4a4044">This is a request, not a booking yet, so the time isn't reserved. If I can take it on, I'll email you the final price and a link to pay your deposit.</p>`;
  return {
    subject: "I've got your custom style request",
    html: emailShell("Request received", intro, rows, after),
    text: [`Hi ${firstName(r.name)},`, "", "Thank you for your custom style request. I'll get back to you within 24-48 hours.", "",
      ...rows.map(([k, v]) => `${k}: ${v}`), "",
      "This is a request, not a booking yet, so the time isn't reserved. If I can take it on, I'll email you the final price and a link to pay your deposit.", "", "Les Braid It"].join("\n"),
  };
}

export function ownerNewRequestEmail(r: RequestDetails, siteUrl: string) {
  const lines = [
    `${r.name} sent a custom style request`,
    `Preferred time: ${prettyWhen(r.date, r.time)}`,
    `Length they think: ${prettyLength(r.duration)}`,
    `Suggested price: ${r.price != null ? pounds(r.price) : "not given"}`,
    `What they want: ${r.description}`,
    `Email: ${r.email}`, `Phone: ${r.phone}`, "",
    `See the photo and accept or decline: ${siteUrl}/admin.html`,
  ];
  return {
    subject: `New custom request: ${r.name}, ${prettyWhen(r.date, r.time)}`,
    text: lines.join("\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${lines.map((l) => esc(l)).join("<br>")}</div>`,
  };
}

export interface OfferDetails {
  name: string; price: number; deposit: number; date: string; time: string; duration: number;
  holdUntil: string; message?: string | null; link: string; changed: boolean;
  requested?: { date: string; time: string; duration: number; price: number | null };
}

const quote = (m?: string | null) =>
  m ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.5;border-left:3px solid #e8558e;padding-left:12px;white-space:pre-wrap">${esc(m)}</p>` : "";

function deadlineText(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
}

// "accepted as asked" or "I've suggested some changes", with the new details
export function offerEmail(o: OfferDetails) {
  const deadline = deadlineText(o.holdUntil);
  const was = (now: string, before: string | null) => (before && before !== now ? `${now} (you asked for ${before})` : now);
  const r = o.requested;
  const rows: [string, string][] = [
    ["When", was(prettyWhen(o.date, o.time), r ? prettyWhen(r.date, r.time) : null)],
    ["Length", was(prettyLength(o.duration), r ? prettyLength(r.duration) : null)],
    ["Price", was(pounds(o.price), r && r.price != null ? pounds(r.price) : null)],
    ["Deposit to pay now", pounds(o.deposit)],
    ["To pay on the day", pounds(o.price - o.deposit)],
  ];
  const first = esc(firstName(o.name));
  const intro = o.changed
    ? `Hi ${first}, thank you for your custom style request. I can do it, with a few changes. I'm holding this time for you until <strong>${esc(deadline)}</strong>.`
    : `Hi ${first}, good news: I can do your custom style! I'm holding this time for you until <strong>${esc(deadline)}</strong>.`;
  const after = `${quote(o.message)}${button(o.link, o.changed ? "See the offer and pay deposit" : `Pay ${pounds(o.deposit)} deposit`)}
<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#6b5f64">Paying the deposit confirms your booking. ${o.changed ? "If you'd like something different, you can reply to me on the same page. " : ""}If it isn't paid by then, the time is released.</p>`;
  return {
    subject: o.changed ? "Your custom style request: I've suggested some changes" : "Your custom style is accepted: pay your deposit to book",
    html: emailShell(o.changed ? "Your offer" : "Request accepted", intro, rows, after),
    text: [`Hi ${firstName(o.name)},`, "",
      o.changed ? "Thank you for your custom style request. I can do it, with a few changes." : "Good news: I can do your custom style!",
      `I'm holding this time for you until ${deadline}.`, "",
      ...rows.map(([k, v]) => `${k}: ${v}`), "", ...(o.message ? [o.message, ""] : []),
      `${o.changed ? "See the offer, reply or pay" : "Pay your deposit"} here: ${o.link}`, "",
      "Paying the deposit confirms your booking. If it isn't paid by then, the time is released.", "", "Les Braid It"].join("\n"),
  };
}

export function ownerMessageEmail(name: string, message: string, link: string) {
  const intro = `Hi ${esc(firstName(name))}, I have a question about your custom style request:`;
  return {
    subject: "A question about your custom style request",
    html: emailShell("About your request", intro, [], `${quote(message)}${button(link, "Reply")}`),
    text: [`Hi ${firstName(name)},`, "", "I have a question about your custom style request:", "", message, "", `Reply here: ${link}`, "", "Les Braid It"].join("\n"),
  };
}

export function declinedEmail(name: string, message: string | null, siteUrl: string) {
  const intro = `Hi ${esc(firstName(name))}, thank you for your custom style request. Unfortunately I can't take this one on.`;
  const after = `${quote(message)}<p style="margin:0;font-size:14px;line-height:1.5;color:#4a4044">You're welcome to look at the styles I offer and <a href="${esc(siteUrl)}/booking.html" style="color:#c93f78">book online</a>.</p>`;
  return {
    subject: "About your custom style request",
    html: emailShell("About your request", intro, [], after),
    text: [`Hi ${firstName(name)},`, "", "Thank you for your custom style request. Unfortunately I can't take this one on.", "",
      ...(message ? [message, ""] : []), `You're welcome to look at the styles I offer and book online: ${siteUrl}/booking.html`, "", "Les Braid It"].join("\n"),
  };
}

// To you, when the client replies or turns your offer down
export function ownerClientUpdateEmail(name: string, kind: "reply" | "decline", message: string | null, siteUrl: string) {
  const lines = [
    kind === "reply" ? `${name} replied about their custom request:` : `${name} turned down your offer for their custom request.`,
    ...(message ? ["", message] : []), "", `Answer on your admin page: ${siteUrl}/admin.html`,
  ];
  return {
    subject: kind === "reply" ? `${name} replied about their custom request` : `${name} declined your offer`,
    text: lines.join("\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${lines.map((l) => esc(l)).join("<br>")}</div>`,
  };
}

/* ---------------- The handler ---------------- */
export function createHandler(deps: Deps) {
  return async function handle(req: Request): Promise<Response> {
    const site = (deps.env("SITE_URL") || "").replace(/\/+$/, "");
    const allowed = (deps.env("ALLOWED_ORIGINS") || (site ? new URL(site).origin : ""))
      .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
    const origin = req.headers.get("origin") || "";
    const originOk = allowed.includes(origin);

    const cors: Record<string, string> = {
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    };
    if (originOk) cors["Access-Control-Allow-Origin"] = origin;
    const reply = (status: number, body: Json) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    const fail = (message: string) => {
      const code = Object.keys(ERRORS).find((k) => message.includes(k));
      if (code) return reply(ERRORS[code][0], { error: ERRORS[code][1], code });
      console.error("custom-requests failed", message);
      return reply(500, { error: "Something went wrong. Please try again." });
    };

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply(405, { error: "Use POST." });
    if (!originOk) return reply(403, { error: "This site is not allowed to send requests." });
    if (!site) return reply(500, { error: "Custom requests are not set up yet (SITE_URL is missing)." });

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const isUserToken = !!token && token !== deps.env("SUPABASE_ANON_KEY") && token.split(".").length === 3;
    const mail = async (m: Mail) => {
      if (!deps.sendEmail) return false;
      try { await deps.sendEmail(m); return true; } catch (err) { console.error("Email failed", (err as Error).message); return false; }
    };
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

    /* ----- submit: multipart form with the photo ----- */
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      let form: FormData;
      try { form = await req.formData(); } catch { return reply(400, { error: "Invalid request." }); }

      const photo = form.get("photo");
      if (!(photo instanceof File) || photo.size === 0) return reply(400, { error: "Please add a photo of the style.", code: "missing_photo" });
      if (photo.size > MAX_PHOTO_BYTES) return reply(413, { error: "That photo is too big. Please use one under 8 MB.", code: "photo_too_big" });
      const ext = PHOTO_TYPES[photo.type];
      if (!ext) return reply(415, { error: "Please upload a JPG, PNG, WEBP or HEIC photo.", code: "photo_type" });

      const details: RequestDetails = {
        name: text(form.get("name"), 120), email: text(form.get("email"), 200), phone: text(form.get("phone"), 40),
        description: text(form.get("description"), 2000),
        duration: Number(form.get("duration")),
        price: text(form.get("price"), 10) === "" ? null : Number(form.get("price")),
        date: text(form.get("date"), 10), time: text(form.get("time"), 8),
      };
      if (!Number.isInteger(details.duration)) return reply(400, { error: ERRORS.invalid_duration[1], code: "invalid_duration" });
      if (details.price != null && !Number.isFinite(details.price)) return reply(400, { error: ERRORS.invalid_price[1], code: "invalid_price" });

      let memberId: string | null = null;
      if (isUserToken) memberId = await deps.userFromToken(token).catch(() => null);

      const now = (deps.now ? deps.now() : new Date());
      const path = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}/${deps.newId()}.${ext}`;
      try {
        await deps.uploadPhoto(path, new Uint8Array(await photo.arrayBuffer()), photo.type);
      } catch (err) {
        console.error("Photo upload failed", (err as Error).message);
        return reply(502, { error: "Could not upload your photo. Please try again." });
      }

      const { error } = await deps.rpc("submit_custom_request", {
        p_member: memberId, p_name: details.name, p_email: details.email, p_phone: details.phone,
        p_description: details.description, p_photo_path: path, p_duration: details.duration,
        p_price: details.price, p_date: details.date, p_time: details.time,
      });
      if (error) {
        await deps.removePhoto(path).catch(() => {});
        return fail(error.message);
      }

      await mail({ to: { email: details.email, name: details.name }, ...requestReceivedEmail(details) });
      await mail({ to: { email: deps.env("OWNER_EMAIL") || deps.env("EMAIL_FROM") || "" }, ...ownerNewRequestEmail(details, site) });
      return reply(200, { ok: true });
    }

    let input: any;
    try { input = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }

    const owner = { email: deps.env("OWNER_EMAIL") || deps.env("EMAIL_FROM") || "" };
    const linkFor = (tokenValue: string) => `${site}/my-request.html?token=${tokenValue}`;

    /* ----- respond: you answer a request (admin only) ----- */
    if (input.action === "respond") {
      const userId = isUserToken ? await deps.userFromToken(token).catch(() => null) : null;
      if (!userId || !(await deps.isAdmin(userId).catch(() => false))) {
        return reply(401, { error: "Please sign in with your admin account." });
      }
      const requestId = text(input.request_id, 64);
      const message = text(input.message, 2000) || null;

      if (input.decision === "decline") {
        const { data, error } = await deps.rpc("decline_custom_request", { p_request: requestId, p_message: message });
        if (error) return fail(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        const emailed = row ? await mail({ to: { email: row.email, name: row.name }, ...declinedEmail(row.name, message, site) }) : false;
        return reply(200, { ok: true, emailed });
      }

      if (input.decision === "message") {
        if (!message) return fail("invalid_message");
        const { data, error } = await deps.rpc("owner_message_custom_request", { p_request: requestId, p_message: message });
        if (error) return fail(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || !row.pay_token) return reply(500, { error: "Something went wrong. Please try again." });
        const link = linkFor(row.pay_token);
        const emailed = await mail({ to: { email: row.email, name: row.name }, ...ownerMessageEmail(row.name, message, link) });
        return reply(200, { ok: true, emailed, link });
      }

      if (input.decision === "offer" || input.decision === "accept") {
        const holdHours = Number(deps.env("CUSTOM_HOLD_HOURS") || 48);
        const { data, error } = await deps.rpc("send_custom_offer", {
          p_request: requestId,
          p_price: Number(input.price),
          p_deposit: Number(input.deposit),
          p_duration: input.duration == null || input.duration === "" ? null : Number(input.duration),
          p_date: text(input.date, 10) || null,
          p_time: text(input.time, 8) || null,
          p_message: message,
          p_hold_hours: holdHours,
        });
        if (error) return fail(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || !row.pay_token) return reply(500, { error: "Something went wrong. Please try again." });
        const link = linkFor(row.pay_token);
        const req = input.requested && typeof input.requested === "object" ? input.requested : null;
        const emailed = await mail({
          to: { email: row.email, name: row.name },
          ...offerEmail({
            name: row.name, price: Number(row.final_price), deposit: Number(row.deposit_amount),
            date: row.final_date, time: row.final_time, duration: row.final_duration,
            holdUntil: row.hold_until, message, link, changed: !!row.changed,
            requested: row.changed && req ? {
              date: String(req.date), time: String(req.time), duration: Number(req.duration),
              price: req.price == null ? null : Number(req.price),
            } : undefined,
          }),
        });
        return reply(200, { ok: true, emailed, link, changed: !!row.changed });
      }
      return reply(400, { error: "Choose offer, message or decline." });
    }

    /* ----- reply / client_decline: the client answers from their request page ----- */
    if (input.action === "reply" || input.action === "client_decline") {
      const payToken = text(input.token, 128);
      const message = text(input.message, 2000) || null;
      const fn = input.action === "reply" ? "client_reply_custom_request" : "client_decline_custom_request";
      const { data, error } = await deps.rpc(fn, { p_token: payToken, p_message: message });
      if (error) return fail(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        await mail({ to: owner, ...ownerClientUpdateEmail(row.name, input.action === "reply" ? "reply" : "decline", message, site) });
      }
      return reply(200, { ok: true });
    }

    /* ----- checkout: the client pays their deposit ----- */
    if (input.action === "checkout") {
      const payToken = text(input.token, 128);
      const { data, error } = await deps.rpc("start_custom_deposit", { p_token: payToken });
      if (error) return fail(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.booking_id) return fail("not_found");
      const bookingId = String(row.booking_id);
      const deposit = Number(row.deposit_amount);

      // Only one open payment page at a time, so the deposit can't be paid twice
      if (row.stripe_session_id) await deps.expireSession(row.stripe_session_id).catch(() => {});

      try {
        const session = await deps.createSession({
          mode: "payment",
          currency: "gbp",
          line_items: [{
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: Math.round(deposit * 100),
              product_data: {
                name: "Deposit: Custom style",
                description: `${prettyWhen(row.final_date, row.final_time)}. Taken off the price of your appointment.`,
              },
            },
          }],
          customer_email: row.email,
          client_reference_id: bookingId,
          metadata: { booking_id: bookingId, custom_request: "1" },
          payment_intent_data: { metadata: { booking_id: bookingId } },
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
          success_url: `${site}/booking-confirmed.html?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${site}/my-request.html?token=${payToken}&cancelled=1`,
        });
        if (!session.url) throw new Error("Stripe returned no checkout address");
        await deps.attachSession(bookingId, session.id);
        return reply(200, { url: session.url });
      } catch (err) {
        console.error("Stripe checkout failed", (err as Error).message);
        return reply(502, { error: "Could not open the payment page. Please try again." });
      }
    }

    return reply(400, { error: "Unknown action." });
  };
}

/* ---------------- Wiring for the real services (skipped in tests) ---------------- */
if (typeof Deno !== "undefined" && (Deno as any).serve && !Deno.env.get("LBI_TEST")) {
  const env = (k: string) => Deno.env.get(k);
  const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const stripe = new Stripe(env("STRIPE_SECRET_KEY") || "", { httpClient: Stripe.createFetchHttpClient() });
  const apiKey = env("BREVO_API_KEY");
  const fromEmail = env("EMAIL_FROM");

  const sendEmail = apiKey && fromEmail ? async (m: Mail) => {
    if (!m.to.email) return;
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: fromEmail, name: env("EMAIL_FROM_NAME") || "Les Braid It" },
        to: [m.to], replyTo: { email: fromEmail },
        subject: m.subject, htmlContent: m.html, textContent: m.text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } : undefined;

  Deno.serve(createHandler({
    env,
    rpc: (fn, args) => db.rpc(fn, args) as any,
    uploadPhoto: async (path, bytes, contentType) => {
      const { error } = await db.storage.from("custom-requests").upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(error.message);
    },
    removePhoto: async (path) => { await db.storage.from("custom-requests").remove([path]); },
    userFromToken: async (token) => {
      const { data } = await db.auth.getUser(token);
      return data?.user?.id ?? null;
    },
    isAdmin: async (userId) => {
      const { data } = await db.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
      return !!data?.is_admin;
    },
    createSession: async (params) => {
      const s = await stripe.checkout.sessions.create(params as any);
      return { id: s.id, url: s.url };
    },
    expireSession: async (sessionId) => {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      if (s.status === "open") await stripe.checkout.sessions.expire(sessionId);
    },
    attachSession: async (bookingId, sessionId) => {
      const { error } = await db.from("bookings").update({ stripe_session_id: sessionId }).eq("id", bookingId);
      if (error) throw new Error(error.message);
    },
    sendEmail,
    newId: () => crypto.randomUUID(),
  }));
}
