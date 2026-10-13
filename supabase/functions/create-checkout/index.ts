// Les Braid It: create-checkout
// Called by the booking page. It saves an unpaid (pending) booking, then
// opens a Stripe Checkout page for the deposit and returns its address.
//
// Secrets needed (Supabase > Edge Functions > Secrets):
//   STRIPE_SECRET_KEY   your Stripe secret key (sk_test_... while testing)
//   SITE_URL            your site address, no trailing slash
//   ALLOWED_ORIGINS     (optional) comma list of sites allowed to call this.
//                       Defaults to SITE_URL's origin.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are added by Supabase.
// Turn "Verify JWT" OFF for this function (guests are not logged in).

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;

export interface Deps {
  env: (key: string) => string | undefined;
  // Calls the create_pending_booking database function
  createPending: (args: Json) => Promise<{ data: any; error: { message: string } | null }>;
  // Returns the user id for a login token, or null
  userFromToken: (token: string) => Promise<string | null>;
  createSession: (params: Json, options: Json) => Promise<{ id: string; url: string | null }>;
  attachSession: (bookingId: string, sessionId: string) => Promise<void>;
  expireBooking: (bookingId: string) => Promise<void>;
}

const ERRORS: Record<string, [number, string]> = {
  invalid_details: [400, "Please check your name, email and phone number."],
  invalid_service: [400, "That style is not available to book online."],
  invalid_duration: [400, "That appointment length is not valid. Please start again."],
  invalid_time: [400, "That time is not available. Please choose another."],
  date_unavailable: [409, "That day is not available. Please choose another."],
  too_many_pending: [429, "You have several unpaid bookings open. Please finish or wait 30 minutes."],
  slot_taken: [409, "Sorry, that time has just been taken. Please choose another time."],
};

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

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply(405, { error: "Use POST." });
    if (!originOk) return reply(403, { error: "This site is not allowed to book." });
    if (!site) return reply(500, { error: "Booking is not set up yet (SITE_URL is missing)." });

    let input: any;
    try { input = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }

    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const duration = Number(input.duration);
    if (!Number.isInteger(duration)) return reply(400, { error: ERRORS.invalid_duration[1] });

    // Logged-in members are linked to their booking. Guests send the public key instead.
    let memberId: string | null = null;
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (token && token !== deps.env("SUPABASE_ANON_KEY") && token.split(".").length === 3) {
      memberId = await deps.userFromToken(token).catch(() => null);
    }

    const { data, error } = await deps.createPending({
      p_member: memberId,
      p_name: text(input.name, 120),
      p_email: text(input.email, 200),
      p_phone: text(input.phone, 40),
      p_service: text(input.service, 200),
      p_addons: text(input.addons, 500),
      p_date: text(input.date, 10),
      p_time: text(input.time, 8),
      p_duration: duration,
    });

    if (error) {
      const code = Object.keys(ERRORS).find((k) => error.message.includes(k));
      if (code) return reply(ERRORS[code][0], { error: ERRORS[code][1], code });
      console.error("create_pending_booking failed", error.message);
      return reply(500, { error: "Something went wrong. Please try again." });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.booking_id) return reply(500, { error: "Something went wrong. Please try again." });
    const bookingId = String(row.booking_id);
    const deposit = Number(row.deposit);

    if (!(deposit > 0)) {
      await deps.expireBooking(bookingId).catch(() => {});
      return reply(500, { error: "This style has no deposit set. Please contact me to book." });
    }

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
              name: `Deposit: ${row.service_name}`,
              description: `${input.date} at ${input.time}. Taken off the price of your appointment.`,
            },
          },
        }],
        customer_email: text(input.email, 200),
        client_reference_id: bookingId,
        metadata: { booking_id: bookingId },
        payment_intent_data: { metadata: { booking_id: bookingId } },
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${site}/booking-confirmed.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/booking.html?cancelled=1`,
      }, { idempotencyKey: `booking-${bookingId}` });

      if (!session.url) throw new Error("Stripe returned no checkout address");
      await deps.attachSession(bookingId, session.id);
      return reply(200, { url: session.url });
    } catch (err) {
      console.error("Stripe checkout failed", (err as Error).message);
      await deps.expireBooking(bookingId).catch(() => {});   // free the slot straight away
      return reply(502, { error: "Could not open the payment page. Please try again." });
    }
  };
}

// Wiring for the real Supabase / Stripe services (skipped in tests)
if (typeof Deno !== "undefined" && (Deno as any).serve) {
  const env = (k: string) => Deno.env.get(k);
  const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const stripe = new Stripe(env("STRIPE_SECRET_KEY")!, { httpClient: Stripe.createFetchHttpClient() });

  Deno.serve(createHandler({
    env,
    createPending: (args) => db.rpc("create_pending_booking", args) as any,
    userFromToken: async (token) => {
      const { data } = await db.auth.getUser(token);
      return data?.user?.id ?? null;
    },
    createSession: async (params, options) => {
      const s = await stripe.checkout.sessions.create(params as any, options as any);
      return { id: s.id, url: s.url };
    },
    attachSession: async (bookingId, sessionId) => {
      const { error } = await db.from("bookings").update({ stripe_session_id: sessionId }).eq("id", bookingId);
      if (error) throw new Error(error.message);
    },
    expireBooking: async (bookingId) => {
      await db.rpc("mark_booking_expired", { p_booking: bookingId });
    },
  }));
}
