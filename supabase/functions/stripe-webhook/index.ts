// Les Braid It: stripe-webhook
// Stripe calls this when a deposit is paid or a checkout runs out.
//   paid    -> booking becomes confirmed (and the slot is locked in)
//   expired -> booking is cancelled and the slot is freed
//   paid but someone else got the slot first -> automatic refund
//
// It also emails the client a confirmation (and tells you about the booking)
// through Brevo. A failed email never undoes a confirmed booking.
//
// Secrets needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_...)
//   BREVO_API_KEY   from Brevo > SMTP & API > API keys (xkeysib-...)
//   EMAIL_FROM      the verified sender, e.g. info@lesbraidit.co.uk
//   SITE_URL        your website address, no trailing slash
// Optional: EMAIL_FROM_NAME (default "Les Braid It"), OWNER_EMAIL (default
//   EMAIL_FROM), LOCATION_TEXT (where the appointment is, shown in the email)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are added by Supabase.
// Turn "Verify JWT" OFF for this function (Stripe has no login token).

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

export interface Deps {
  verify: (body: string, signature: string) => Promise<any>;   // returns the Stripe event or throws
  confirmPaid: (booking: string, session: string, intent: string | null, amount: number | null) => Promise<string>;
  markExpired: (booking: string) => Promise<void>;
  markRefunded: (booking: string) => Promise<void>;
  refund: (intent: string, booking: string) => Promise<void>;
  // Optional: sends the confirmation email. Must never throw for a missing setup.
  sendConfirmation?: (booking: string) => Promise<void>;
}

export function createHandler(deps: Deps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method !== "POST") return new Response("Use POST", { status: 405 });
    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Missing signature", { status: 400 });

    const body = await req.text();
    let event: any;
    try {
      event = await deps.verify(body, signature);
    } catch (err) {
      console.error("Bad signature", (err as Error).message);
      return new Response("Invalid signature", { status: 400 });
    }

    try {
      const session = event.data?.object;
      const bookingId: string | undefined = session?.metadata?.booking_id || session?.client_reference_id;

      if (event.type === "checkout.session.completed" && bookingId) {
        if (session.payment_status !== "paid") {
          // Delayed payment methods: wait for the "async_payment_succeeded" event
          return new Response("Not paid yet", { status: 200 });
        }
        await handlePaid(deps, bookingId, session);
      } else if (event.type === "checkout.session.async_payment_succeeded" && bookingId) {
        await handlePaid(deps, bookingId, session);
      } else if ((event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") && bookingId) {
        await deps.markExpired(bookingId);
      }
      return new Response("ok", { status: 200 });
    } catch (err) {
      console.error("Webhook processing failed", (err as Error).message);
      return new Response("Processing failed", { status: 500 });   // Stripe will retry
    }
  };
}

/* ---------------- Emails ---------------- */
export interface BookingDetails {
  name: string; email: string; service_type: string; addons: string | null;
  booking_date: string; booking_time: string; duration_minutes: number | null;
  deposit_amount: number | string | null; price: number | string | null;
}

const esc = (v: unknown) =>
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

const pounds = (n: number) => "\u00a3" + (Number.isInteger(n) ? n : n.toFixed(2));

export function buildClientEmail(b: BookingDetails, opts: { siteUrl: string; location?: string }) {
  const when = prettyWhen(b.booking_date, b.booking_time);
  const deposit = b.deposit_amount != null ? Number(b.deposit_amount) : null;
  const price = b.price != null ? Number(b.price) : null;
  const balance = deposit != null && price != null && price > deposit ? price - deposit : null;
  const first = String(b.name || "").trim().split(/\s+/)[0] || "there";
  const policies = `${opts.siteUrl}/policies.html`;

  const rows: [string, string][] = [["Style", b.service_type], ["When", when]];
  if (b.addons) rows.push(["Add-ons", b.addons]);
  if (deposit != null) rows.push(["Deposit paid", pounds(deposit)]);
  if (balance != null) rows.push(["To pay on the day", pounds(balance)]);
  if (opts.location) rows.push(["Where", opts.location]);

  const subject = `You're booked in: ${b.service_type}, ${when}`;
  const text = [
    `Hi ${first},`, "", "Thank you, your deposit has been received and your appointment is confirmed.", "",
    ...rows.map(([k, v]) => `${k}: ${v}`), "",
    "Your deposit comes off the price of your appointment. Please read the policies for rescheduling and cancellations:", policies, "",
    "Reply to this email if you have any questions.", "", "Les Braid It",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f1f2;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;border-top:4px solid #e8558e" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 26px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e8558e">Les Braid It</p>
<h1 style="margin:0 0 14px;font-size:26px;font-style:italic;font-family:Georgia,serif">You're booked in!</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5">Hi ${esc(first)}, thank you. Your deposit has been received and your appointment is confirmed.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eadde2;border-radius:10px">
${rows.map(([k, v]) => `<tr><td style="padding:10px 14px;font-size:13px;color:#6b5f64;width:38%;border-bottom:1px solid #f1e8eb">${esc(k)}</td><td style="padding:10px 14px;font-size:15px;font-weight:600;border-bottom:1px solid #f1e8eb">${esc(v)}</td></tr>`).join("")}
</table>
<p style="margin:18px 0 0;font-size:14px;line-height:1.5;color:#4a4044">Your deposit comes off the price of your appointment. Please read the <a href="${esc(policies)}" style="color:#c93f78">policies</a> for rescheduling and cancellations.</p>
<p style="margin:14px 0 0;font-size:14px;line-height:1.5;color:#4a4044">Questions? Just reply to this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

export function buildOwnerEmail(b: BookingDetails, opts: { siteUrl: string }) {
  const when = prettyWhen(b.booking_date, b.booking_time);
  const lines = [`${b.name} booked ${b.service_type}`, `When: ${when}`];
  if (b.addons) lines.push(`Add-ons: ${b.addons}`);
  if (b.deposit_amount != null) lines.push(`Deposit paid: ${pounds(Number(b.deposit_amount))}`);
  lines.push(`Email: ${b.email}`, "", `Admin: ${opts.siteUrl}/admin.html`);
  return {
    subject: `New booking: ${b.service_type}, ${when}`,
    text: lines.join("\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${lines.map((l) => esc(l)).join("<br>")}</div>`,
  };
}

export async function sendViaBrevo(
  fetchFn: typeof fetch, apiKey: string,
  mail: { to: { email: string; name?: string }; subject: string; html: string; text: string },
  from: { email: string; name: string },
) {
  const res = await fetchFn("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: from, to: [mail.to], replyTo: { email: from.email },
      subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function handlePaid(deps: Deps, bookingId: string, session: any) {
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const amount = typeof session.amount_total === "number" ? session.amount_total / 100 : null;
  const result = await deps.confirmPaid(bookingId, session.id, intent, amount);

  if (result === "confirmed" && deps.sendConfirmation) {
    try {
      await deps.sendConfirmation(bookingId);
    } catch (err) {
      console.error("Confirmation email failed", (err as Error).message);   // booking stays confirmed
    }
  }

  if ((result === "conflict" || result === "cancelled") && intent) {
    await deps.refund(intent, bookingId);
    await deps.markRefunded(bookingId);
  } else if (result === "not_found") {
    throw new Error(`Paid booking ${bookingId} not found`);
  }
}

if (typeof Deno !== "undefined" && (Deno as any).serve) {
  const env = (k: string) => Deno.env.get(k);
  const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const stripe = new Stripe(env("STRIPE_SECRET_KEY")!, { httpClient: Stripe.createFetchHttpClient() });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  const siteUrl = (env("SITE_URL") || "").replace(/\/+$/, "");
  const sendConfirmation = async (bookingId: string) => {
    const apiKey = env("BREVO_API_KEY");
    const fromEmail = env("EMAIL_FROM");
    if (!apiKey || !fromEmail || !siteUrl) { console.warn("Email not set up (BREVO_API_KEY, EMAIL_FROM, SITE_URL)"); return; }
    const { data, error } = await db.rpc("claim_confirmation_email", { p_booking: bookingId });
    if (error) throw new Error("claim_confirmation_email: " + error.message);
    const b = Array.isArray(data) ? data[0] : data;
    if (!b) return;                                   // already sent
    const from = { email: fromEmail, name: env("EMAIL_FROM_NAME") || "Les Braid It" };
    try {
      const client = buildClientEmail(b, { siteUrl, location: env("LOCATION_TEXT") || undefined });
      await sendViaBrevo(fetch, apiKey, { to: { email: b.email, name: b.name }, ...client }, from);
    } catch (err) {
      await db.rpc("release_confirmation_email", { p_booking: bookingId });   // allow a later resend
      throw err;
    }
    try {                                              // heads-up to you; never blocks the client's email
      const owner = buildOwnerEmail(b, { siteUrl });
      await sendViaBrevo(fetch, apiKey, { to: { email: env("OWNER_EMAIL") || fromEmail }, ...owner }, from);
    } catch (err) { console.error("Owner email failed", (err as Error).message); }
  };

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };

  Deno.serve(createHandler({
    verify: (body, signature) =>
      stripe.webhooks.constructEventAsync(body, signature, env("STRIPE_WEBHOOK_SECRET")!, undefined, cryptoProvider),
    confirmPaid: (booking, session, intent, amount) =>
      rpc("confirm_booking_paid", { p_booking: booking, p_session: session, p_intent: intent, p_amount: amount }),
    markExpired: async (booking) => { await rpc("mark_booking_expired", { p_booking: booking }); },
    markRefunded: async (booking) => { await rpc("mark_booking_refunded", { p_booking: booking }); },
    refund: async (intent, booking) => {
      // The idempotency key stops a retried webhook refunding twice
      await stripe.refunds.create({ payment_intent: intent, metadata: { booking_id: booking, reason: "slot_taken" } },
        { idempotencyKey: `refund-${booking}` });
    },
    sendConfirmation,
  }));
}
