import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const paymentConfig = readFileSync(
  "src/app/api/admin/payment-config/route.ts",
  "utf8",
);
const khqr = readFileSync("src/app/api/payments/khqr/route.ts", "utf8");
const status = readFileSync(
  "src/app/api/payments/[paymentId]/status/route.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20261108000000_bakong_atomic_completion_grace.sql",
  "utf8",
);
const payPage = readFileSync("src/app/pay/[username]/page.tsx", "utf8");

test("global payment credentials require an administrator", () => {
  assert.match(paymentConfig, /\.from\("profiles"\)\s*\.select\("role"\)/);
  assert.match(paymentConfig, /profile\?\.role !== "admin"/);
  assert.match(paymentConfig, /Admin access is required/);
  assert.doesNotMatch(paymentConfig, /async function requireUser/);
});

test("Bakong payments create a linked donation so media reaches the tip", () => {
  const bakong = khqr.slice(
    khqr.indexOf('if (provider === "aba_payway")'),
    khqr.indexOf("async function createAbaPaywayPayment"),
  );

  assert.match(bakong, /from\("donations"\)\.insert/);
  assert.match(bakong, /donation_id: donationId/);
  assert.match(bakong, /voice_path: media\.media\.voicePath/);
  assert.match(bakong, /voice_duration_seconds:/);
  assert.match(bakong, /parseDonorMedia\(input\)/);
});

test("Bakong payment outcomes use atomic linked-donation completion", () => {
  assert.match(status, /\.rpc\(\s*"streamkit_complete_bakong_payment"/);
  assert.match(status, /\.update\(\{\s*status:\s*"review_required"\s*\}\)/);

  assert.match(
    migration,
    /update public\.donations\s+set status = 'completed'/,
  );
  assert.match(
    migration,
    /update public\.payment_transactions\s+set status = 'successful'/,
  );
  assert.match(migration, /for update/);
});

test("the public tip page shows no invented donation history or dead controls", () => {
  assert.doesNotMatch(payPage, /RECENT_DONATIONS/);
  assert.doesNotMatch(payPage, /WATCH MULTI-STREAM/);
  assert.match(payPage, /"refunded"/);
  assert.match(payPage, /result\.status === "refunded"/);
  assert.match(payPage, /This payment was refunded\./);
});
const webhook = readFileSync(
  "src/app/api/payments/webhook/route.ts",
  "utf8",
);
const abaMigration = readFileSync(
  "supabase/migrations/20261109000000_aba_atomic_terminal_transitions.sql",
  "utf8",
);

test("ABA terminal transitions use a locked service-role-only atomic RPC", () => {
  assert.match(
    abaMigration,
    /create or replace function public\.streamkit_transition_aba_payment/i,
  );
  assert.match(abaMigration, /for update/i);
  assert.match(abaMigration, /security definer/i);
  assert.match(abaMigration, /search_path\s*=\s*''/i);
  assert.match(abaMigration, /grant execute[\s\S]*to service_role/i);
  assert.match(abaMigration, /review_required/i);
  assert.match(abaMigration, /payment_webhooks/i);
  assert.match(abaMigration, /v_donation\.creator_id is distinct from v_payment\.creator_id/);
  assert.match(abaMigration, /v_donation\.donor_name is distinct from v_payment\.donor_name/);
  assert.match(abaMigration, /v_donation\.amount is distinct from v_payment\.amount/);
  assert.match(abaMigration, /v_donation\.currency is distinct from v_payment\.currency/);
  assert.match(abaMigration, /v_payment\.status in \('successful', 'completed'\)/);
  assert.match(abaMigration, /update public\.payment_webhooks\s+set processed = true/i);
});

test("ABA status checks use atomic terminal transitions and preserve completion RPCs", () => {
  const helperStart = status.indexOf("async function updateAbaTerminalStatus");
  const helperEnd = status.indexOf("async function paymentResult", helperStart);

  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);

  const helper = status.slice(helperStart, helperEnd);

  assert.match(helper, /streamkit_transition_aba_payment/);
  assert.match(helper, /p_webhook_id:\s*null/);
  assert.match(helper, /currentPayment\.status/);
  assert.match(
    helper,
    /const \{ data: currentPayment, error: currentPaymentError \} =[\s\S]*?\.eq\("id", payment\.id\)\s*\.single\(\)/,
  );
  assert.match(
    helper,
    /currentPayment\.status === "successful"[\s\S]*currentPayment\.status === "completed"/,
  );
  assert.match(status, /"review_required",\s*"amount_or_currency_mismatch"/);
  assert.match(status, /streamkit_complete_aba_payment/);
  assert.match(status, /streamkit_complete_bakong_payment/);
});

test("ABA webhook mismatch and terminal outcomes use atomic transitions", () => {
  assert.equal(
    (webhook.match(/streamkit_transition_aba_payment/g) ?? []).length,
    2,
  );
  assert.match(webhook, /p_target_status:\s*"review_required"/);
  assert.match(webhook, /p_failure_reason:\s*"verified_transaction_mismatch"/);
  assert.match(webhook, /p_webhook_id:\s*webhook\.id/);
  assert.match(webhook, /p_target_status:\s*terminalStatus/);
  assert.match(webhook, /streamkit_complete_aba_payment/);
  assert.doesNotMatch(
    webhook,
    /\.from\("payment_transactions"\)\s*\.update\(/,
  );
  assert.doesNotMatch(webhook, /\.from\("donations"\)\s*\.update\(/);
});
test("successful payment status reads do not independently complete donations", () => {
  const resultStart = status.indexOf("async function paymentResult");
  assert.notEqual(resultStart, -1);

  const result = status.slice(resultStart);

  assert.match(result, /payment\.status !== "successful"[\s\S]*payment\.status !== "completed"/);
  assert.doesNotMatch(result, /\.from\("donations"\)\s*\.update\(/);
  assert.match(result, /\.from\("tips"\)/);
  assert.match(result, /\.eq\("payment_transaction_id", payment\.id\)/);
});
