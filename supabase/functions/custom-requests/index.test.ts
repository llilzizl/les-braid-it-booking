// Tests for the custom-requests function. Run with:
//   LBI_TEST=1 deno test --allow-env supabase/functions/custom-requests/
// Every outside service (database, storage, Stripe, email) is replaced by a
// fake, so nothing real is touched.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
const assertStringIncludes = (text: string, part: string) => assert(text.includes(part), `expected to find: ${part}`);
import { createHandler, Deps, Mail, prettyLength, offerEmail } from "./index.ts";

const SITE = "https://llilzizl.github.io/les-braid-it-booking";
const ORIGIN = "https://llilzizl.github.io";

function fakeDeps(over: Partial<Deps> = {}) {
  const log = { rpc: [] as [string, any][], uploads: [] as string[], removed: [] as string[], mails: [] as Mail[], sessions: [] as any[], expired: [] as string[], attached: [] as string[] };
  const deps: Deps = {
    env: (k) => ({ SITE_URL: SITE, SUPABASE_ANON_KEY: "anon", OWNER_EMAIL: "info@lesbraidit.co.uk" } as Record<string, string>)[k],
    rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: [{ ok: true }], error: null }; },
    uploadPhoto: async (path) => { log.uploads.push(path); },
    removePhoto: async (path) => { log.removed.push(path); },
    userFromToken: async () => null,
    isAdmin: async () => false,
    createSession: async (p) => { log.sessions.push(p); return { id: "cs_new", url: "https://checkout.stripe.com/x" }; },
    expireSession: async (id) => { log.expired.push(id); },
    attachSession: async (b, s) => { log.attached.push(`${b}:${s}`); },
    sendEmail: async (m) => { log.mails.push(m); },
    newId: () => "photo-id",
    now: () => new Date("2026-10-20T12:00:00Z"),
    ...over,
  };
  return { deps, log };
}

function submitRequest(fields: Record<string, string>, photo?: File | null, origin = ORIGIN) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (photo !== null) fd.append("photo", photo ?? new File([new Uint8Array(2000)], "style.jpg", { type: "image/jpeg" }));
  return new Request("https://x/functions/v1/custom-requests", { method: "POST", headers: { origin }, body: fd });
}
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://x/functions/v1/custom-requests", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const GOOD = { name: "Amara Test", email: "amara@example.com", phone: "07000000000", description: "Waist length knotless", duration: "300", price: "90", date: "2026-10-31", time: "10:00" };

Deno.test("submit: uploads the photo, saves the request and emails both of you", async () => {
  const { deps, log } = fakeDeps();
  const res = await createHandler(deps)(submitRequest(GOOD));
  assertEquals(res.status, 200);
  assertEquals(log.uploads, ["2026-10/photo-id.jpg"]);
  const [fn, args] = log.rpc[0];
  assertEquals(fn, "submit_custom_request");
  assertEquals(args.p_duration, 300);
  assertEquals(args.p_price, 90);
  assertEquals(args.p_photo_path, "2026-10/photo-id.jpg");
  assertEquals(log.mails.map((m) => m.to.email), ["amara@example.com", "info@lesbraidit.co.uk"]);
  assertStringIncludes(log.mails[1].text, `${SITE}/admin.html`);
});

Deno.test("submit: price is optional", async () => {
  const { deps, log } = fakeDeps();
  const res = await createHandler(deps)(submitRequest({ ...GOOD, price: "" }));
  assertEquals(res.status, 200);
  assertEquals(log.rpc[0][1].p_price, null);
});

Deno.test("submit: needs a photo, under 8 MB, of an image type", async () => {
  const { deps, log } = fakeDeps();
  const h = createHandler(deps);
  assertEquals((await h(submitRequest(GOOD, null))).status, 400);
  assertEquals((await h(submitRequest(GOOD, new File([new Uint8Array(9 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" })))).status, 413);
  assertEquals((await h(submitRequest(GOOD, new File(["hi"], "x.pdf", { type: "application/pdf" })))).status, 415);
  assertEquals(log.uploads.length, 0);
});

Deno.test("submit: database refusal removes the photo and explains why", async () => {
  const { deps, log } = fakeDeps({ rpc: async () => ({ data: null, error: { message: "slot_taken" } }) });
  const res = await createHandler(deps)(submitRequest(GOOD));
  assertEquals(res.status, 409);
  assertEquals((await res.json()).code, "slot_taken");
  assertEquals(log.removed, ["2026-10/photo-id.jpg"]);
  assertEquals(log.mails.length, 0);
});

Deno.test("submit: other websites are refused", async () => {
  const { deps } = fakeDeps();
  assertEquals((await createHandler(deps)(submitRequest(GOOD, undefined, "https://evil.example"))).status, 403);
});

Deno.test("submit: still works when emails are not set up", async () => {
  const { deps } = fakeDeps({ sendEmail: undefined });
  assertEquals((await createHandler(deps)(submitRequest(GOOD))).status, 200);
});

Deno.test("respond: only an admin can accept or decline", async () => {
  const { deps, log } = fakeDeps({ userFromToken: async () => "user-1", isAdmin: async () => false });
  const h = createHandler(deps);
  assertEquals((await h(json({ action: "respond", decision: "accept", request_id: "r1", price: 100, deposit: 30 }))).status, 401);
  assertEquals((await h(json({ action: "respond", decision: "accept", request_id: "r1", price: 100, deposit: 30 }, { authorization: "Bearer a.b.c" }))).status, 401);
  assertEquals(log.rpc.length, 0);
});

const ADMIN = { userFromToken: async () => "admin-1", isAdmin: async () => true };
const OFFER_ROW = (changed: boolean) => ({ pay_token: "t".repeat(64), name: "Amara Test", email: "amara@example.com", changed,
  final_price: 120, deposit_amount: 30, final_date: "2026-10-31", final_time: "09:30:00", final_duration: 330, hold_until: "2026-10-22T12:00:00Z" });

Deno.test("respond: accept as asked emails a deposit link", async () => {
  const { deps, log } = fakeDeps({ ...ADMIN, rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: [OFFER_ROW(false)], error: null }; } });
  const res = await createHandler(deps)(json({ action: "respond", decision: "offer", request_id: "r1", price: 120, deposit: 30, duration: "", message: "See you then!" }, { authorization: "Bearer a.b.c" }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.link, `${SITE}/my-request.html?token=${"t".repeat(64)}`);
  assertEquals(log.rpc[0][0], "send_custom_offer");
  assertEquals(log.rpc[0][1].p_duration, null);
  assertEquals(log.rpc[0][1].p_hold_hours, 48);
  assertEquals(log.mails[0].subject, "Your custom style is accepted: pay your deposit to book");
  assertStringIncludes(log.mails[0].html, body.link);
  assertStringIncludes(log.mails[0].text, "See you then!");
  assertStringIncludes(log.mails[0].text, "To pay on the day: £90");
});

Deno.test("respond: suggested changes show what changed", async () => {
  const { deps, log } = fakeDeps({ ...ADMIN, rpc: async () => ({ data: [OFFER_ROW(true)], error: null }) });
  const res = await createHandler(deps)(json({ action: "respond", decision: "offer", request_id: "r1", price: 120, deposit: 30, duration: 330, date: "2026-10-31", time: "09:30",
    message: "Can you do 9:30?", requested: { date: "2026-10-31", time: "10:00", duration: 300, price: 90 } }, { authorization: "Bearer a.b.c" }));
  assertEquals(res.status, 200);
  assertEquals(log.mails[0].subject, "Your custom style request: I've suggested some changes");
  assertStringIncludes(log.mails[0].text, "(you asked for Saturday 31 October 2026 at 10am)");
  assertStringIncludes(log.mails[0].text, "£120 (you asked for £90)");
  assertStringIncludes(log.mails[0].text, "5 hrs 30 mins (you asked for 5 hrs)");
});

Deno.test("respond: message only emails your question with a reply link", async () => {
  const { deps, log } = fakeDeps({ ...ADMIN, rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: [{ pay_token: "t".repeat(64), name: "Amara", email: "amara@example.com" }], error: null }; } });
  const h = createHandler(deps);
  assertEquals((await h(json({ action: "respond", decision: "message", request_id: "r1", message: "" }, { authorization: "Bearer a.b.c" }))).status, 400);
  const res = await h(json({ action: "respond", decision: "message", request_id: "r1", message: "Is your hair natural?" }, { authorization: "Bearer a.b.c" }));
  assertEquals(res.status, 200);
  assertEquals(log.rpc[0], ["owner_message_custom_request", { p_request: "r1", p_message: "Is your hair natural?" }]);
  assertStringIncludes(log.mails[0].text, "Is your hair natural?");
  assertStringIncludes(log.mails[0].text, "my-request.html?token=");
});

Deno.test("client reply and decline email you", async () => {
  const { deps, log } = fakeDeps({ rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: [{ name: "Amara", email: "amara@example.com" }], error: null }; } });
  const h = createHandler(deps);
  assertEquals((await h(json({ action: "reply", token: "t".repeat(64), message: "Could it be 100?" }))).status, 200);
  assertEquals(log.rpc[0][0], "client_reply_custom_request");
  assertEquals(log.mails[0].to.email, "info@lesbraidit.co.uk");
  assertStringIncludes(log.mails[0].text, "Could it be 100?");
  assertStringIncludes(log.mails[0].text, `${SITE}/admin.html`);
  assertEquals((await h(json({ action: "client_decline", token: "t".repeat(64), message: "" }))).status, 200);
  assertEquals(log.rpc[1][0], "client_decline_custom_request");
  assertEquals(log.mails[1].subject, "Amara declined your offer");
});

Deno.test("checkout: opens Stripe for the deposit and closes any older payment page", async () => {
  const { deps, log } = fakeDeps({
    rpc: async (fn, args) => {
      log.rpc.push([fn, args]);
      return { data: [{ booking_id: "b1", deposit_amount: 30, email: "amara@example.com", final_date: "2026-10-31", final_time: "10:00:00", stripe_session_id: "cs_old" }], error: null };
    },
  });
  const res = await createHandler(deps)(json({ action: "checkout", token: "t".repeat(64) }));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).url, "https://checkout.stripe.com/x");
  assertEquals(log.expired, ["cs_old"]);
  assertEquals(log.sessions[0].line_items[0].price_data.unit_amount, 3000);
  assertEquals(log.sessions[0].metadata.booking_id, "b1");
  assert(log.sessions[0].success_url.includes("booking-confirmed.html"));
  assert(log.sessions[0].cancel_url.includes("my-request.html"));
  assertEquals(log.attached, ["b1:cs_new"]);
});

Deno.test("checkout: an expired hold gets a clear message", async () => {
  const { deps } = fakeDeps({ rpc: async () => ({ data: null, error: { message: "hold_expired" } }) });
  const res = await createHandler(deps)(json({ action: "checkout", token: "t".repeat(64) }));
  assertEquals(res.status, 410);
  assertStringIncludes((await res.json()).error, "run out");
});

Deno.test("emails: lengths and escaping", () => {
  assertEquals(prettyLength(90), "1 hr 30 mins");
  assertEquals(prettyLength(300), "5 hrs");
  const m = offerEmail({ name: "<b>Eve</b>", price: 100, deposit: 30, date: "2026-10-31", time: "10:00", duration: 300, holdUntil: "2026-10-22T12:00:00Z", message: "<script>", link: "https://x", changed: false });
  assert(!m.html.includes("<script>"));
  assert(!m.html.includes("<b>Eve</b>"));
});
