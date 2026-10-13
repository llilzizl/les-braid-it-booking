// Les Braid It: stripe-webhook
// Stripe calls this when a deposit is paid or a checkout runs out.
//   paid    -> booking becomes confirmed (and the slot is locked in)
//   expired -> booking is cancelled and the slot is freed
//   paid but someone else got the slot first -> automatic refund
//
// Secrets needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_...)
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

async function handlePaid(deps: Deps, bookingId: string, session: any) {
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const amount = typeof session.amount_total === "number" ? session.amount_total / 100 : null;
  const result = await deps.confirmPaid(bookingId, session.id, intent, amount);

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
  }));
}
