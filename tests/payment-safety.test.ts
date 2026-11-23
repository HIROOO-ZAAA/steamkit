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
const profileMigration = readFileSync(
  "supabase/migrations/20261030000001_profiles_role_privilege_canonical.sql",
  "utf8",
);
const payPage = readFileSync("src/app/pay/[username]/page.tsx", "utf8");
const goalsPage = readFileSync("src/app/dashboard/widgets/goals/page.tsx", "utf8");
const goalAdjustmentMigration = readFileSync(
  "supabase/migrations/20261110000000_goal_manual_adjustments.sql",
  "utf8",
);

test("manual goal adjustments use a dedicated authenticated RPC", () => {
  assert.match(goalsPage, /streamkit_add_goal_adjustment/);
  assert.match(goalsPage, /p_amount:\s*delta/);
  assert.doesNotMatch(
    goalsPage,
    /supabase\.from\(['"]tips['"]\)\s*\.insert/,
  );
});

test("goal adjustment RPC enforces creator ownership and amount limits", () => {
  assert.match(goalAdjustmentMigration, /auth\.uid\(\)/);
  assert.match(goalAdjustmentMigration, /v_user is null/);
  assert.match(goalAdjustmentMigration, /p_amount > 10000/);
  assert.match(goalAdjustmentMigration, /p_amount < -10000/);
  assert.match(goalAdjustmentMigration, /p_amount = 0/);
  assert.match(goalAdjustmentMigration, /'manual'/);
  assert.match(goalAdjustmentMigration, /'test'/);
  assert.match(goalAdjustmentMigration, /'USD'/);
  assert.match(goalAdjustmentMigration, /payment_transaction_id[\s\S]*?null/i);
  assert.match(goalAdjustmentMigration, /returning id into v_tip_id/i);
});

test("goal adjustment RPC has restricted execution and hardened search path", () => {
  assert.match(goalAdjustmentMigration, /security definer/i);
  assert.match(goalAdjustmentMigration, /set search_path = ''/i);
  assert.match(
    goalAdjustmentMigration,
    /revoke all on function public\.streamkit_add_goal_adjustment\(numeric\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    goalAdjustmentMigration,
    /grant execute on function public\.streamkit_add_goal_adjustment\(numeric\)\s*to authenticated/i,
  );
  assert.match(goalAdjustmentMigration, /has_function_privilege\('anon'/i);
  assert.match(goalAdjustmentMigration, /has_function_privilege\('service_role'/i);
  assert.match(goalAdjustmentMigration, /PUBLIC must not execute/i);
});

test("global payment credentials require an administrator", () => {
  // Authorization is delegated to the shared platform-role guard, which
  // verifies the caller's role via the platform_roles table and returns 401
  // if not authenticated or 403 if role is insufficient (instead of 503).
  assert.match(paymentConfig, /requirePlatformAdmin/);
  assert.match(paymentConfig, /unauthorizedResponse/);
  assert.doesNotMatch(paymentConfig, /async function requireUser/);
  assert.doesNotMatch(paymentConfig, /profile\?\.role !== "admin"/);
});

test("profile migration exposes only reviewed public SELECT columns", () => {
  assert.match(
    profileMigration,
    /grant select\s*\(\s*id,\s*username,\s*display_name,\s*avatar_url,\s*banner_url,\s*bio,\s*stream_title\s*\)\s*on table public\.profiles to anon, authenticated;/i,
  );
  assert.doesNotMatch(
    profileMigration,
    /grant select on table public\.profiles to anon, authenticated/i,
  );
  assert.match(
    profileMigration,
    /has_table_privilege\(v_role::name, 'public\.profiles', v_priv\)/,
  );
  assert.match(
    profileMigration,
    /'SELECT', 'INSERT', 'UPDATE', 'DELETE'/,
  );
  assert.match(
    profileMigration,
    /has_column_privilege\(v_role::name, 'public\.profiles', v_col, 'SELECT'\)/,
  );
  assert.match(
    profileMigration,
    /can SELECT unapproved column/,
  );
  assert.match(
    profileMigration,
    /array\['role', 'created_at'\]/,
  );
  assert.match(
    profileMigration,
    /cannot SELECT approved column/,
  );
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

test("ABA transaction checks use the stored payment currency", () => {
  assert.match(
    webhook,
    /checkAbaTransaction\(\s*tranId,\s*undefined,\s*payment\.currency === "KHR" \? "KHR" : "USD",\s*\)/,
  );
  assert.doesNotMatch(webhook, /checkAbaTransaction\(\s*tranId\s*\)/);
  assert.match(
    status,
    /checkAbaTransaction\(\s*payment\.tran_id,\s*undefined,\s*payment\.currency === "KHR" \? "KHR" : "USD",\s*\)/,
  );
});

test("ABA terminal successes require a tip before acknowledgement", () => {
  const terminalStart = webhook.indexOf(
    'if (payment.status !== "pending" && payment.status !== "processing")',
  );
  const terminalEnd = webhook.indexOf(
    "const checked = await checkAbaTransaction",
    terminalStart,
  );
  assert.notEqual(terminalStart, -1);
  assert.notEqual(terminalEnd, -1);

  const terminal = webhook.slice(terminalStart, terminalEnd);
  const completedGuard = terminal.indexOf(
    'if (payment.status === "completed" || payment.status === "successful")',
  );
  const tipQuery = terminal.indexOf('.from("tips")');
  const tipError = terminal.indexOf("if (tipError) throw tipError;");
  const missingTip = terminal.indexOf("if (!tip)");
  const markProcessed = terminal.indexOf("markWebhookProcessed");

  assert.notEqual(completedGuard, -1);
  assert.notEqual(tipQuery, -1);
  assert.notEqual(tipError, -1);
  assert.notEqual(missingTip, -1);
  assert.notEqual(markProcessed, -1);
  assert.ok(completedGuard < tipQuery);
  assert.ok(tipQuery < tipError);
  assert.ok(tipError < missingTip);
  assert.ok(missingTip < markProcessed);
  assert.match(
    terminal,
    /\.from\("tips"\)\s*\.select\("id"\)\s*\.eq\("payment_transaction_id", payment\.id\)\s*\.maybeSingle\(\)/,
  );

  const missingTipBranch = terminal.slice(missingTip, markProcessed);
  assert.match(missingTipBranch, /return Response\.json\(/);
  assert.match(missingTipBranch, /accepted:\s*false/);
  assert.match(missingTipBranch, /status:\s*500/);
  assert.match(missingTipBranch, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(missingTipBranch, /markWebhookProcessed/);
});

test("ABA terminal tip guard preserves existing and non-success acknowledgement", () => {
  const terminalStart = webhook.indexOf(
    'if (payment.status !== "pending" && payment.status !== "processing")',
  );
  const terminalEnd = webhook.indexOf(
    "const checked = await checkAbaTransaction",
    terminalStart,
  );
  assert.notEqual(terminalStart, -1);
  assert.notEqual(terminalEnd, -1);

  const terminal = webhook.slice(terminalStart, terminalEnd);

  assert.equal((terminal.match(/\.from\("tips"\)/g) ?? []).length, 1);
  assert.match(
    terminal,
    /if \(payment\.status === "completed" \|\| payment\.status === "successful"\) \{\s*const \{ data: tip, error: tipError \}/,
  );
  assert.match(
    terminal,
    /await markWebhookProcessed\(supabase, webhook\.id\);\s*return Response\.json\(\s*\{ accepted: true, status: payment\.status, tranId \}/,
  );
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

test("ABA webhook dispatch follows the callback identity", () => {
  assert.match(webhook, /process\.env\.PAYMENT_PROVIDER\?\.trim\(\)\.toLowerCase\(\) === "aba_payway"/);
  assert.match(webhook, /request\.headers\.has\("x-payway-hmac-sha512"\)/);
  assert.match(khqr, /new URL\("\/api\/payments\/webhook", request\.url\)/);
});

test("ABA completion RPCs guard state, identity, amount, currency, and time under lock", () => {
  const sources = [
    readFileSync("supabase/migrations/20261111000009_subscription_payment_rpcs.sql", "utf8"),
    readFileSync("supabase/migrations/20261119000002_aba_completion_guard.sql", "utf8"),
    readFileSync("supabase_schema.sql", "utf8"),
    readFileSync("supabase/migrations/20261111000001_sync_canonical_schema.sql", "utf8"),
  ];

  for (const source of sources) {
    assert.match(source, /create or replace function public\.streamkit_complete_aba_payment/i);
    assert.match(source, /v_payment public\.payment_transactions%rowtype/i);
    assert.match(source, /for update/i);
    assert.match(source, /v_payment\.status in \('successful', 'completed'\)[\s\S]*?return;/i);
    assert.match(source, /v_payment\.provider is distinct from 'aba_payway'/i);
    assert.match(source, /v_payment\.status not in \('pending', 'processing'\)/i);
    assert.match(source, /p_verified_amount <> v_payment\.amount/i);
    assert.match(source, /p_verified_currency <> v_payment\.currency/i);
    assert.match(source, /p_provider_paid_at < v_payment\.created_at - interval '1 minute'/i);
    assert.match(source, /p_provider_paid_at > v_payment\.expires_at/i);
    assert.match(source, /case when v_payment\.metadata ->> 'subscriber_id' is not null/i);
    assert.doesNotMatch(source, /(?<![.\w])metadata ->>/i);
    assert.doesNotMatch(source, /subscriber_id' is not null then/i);
  }
});

test("ABA corrective migration guards against a return-type collision", () => {
  const guard = readFileSync(
    "supabase/migrations/20261119000002_aba_completion_guard.sql",
    "utf8",
  );
  assert.match(guard, /pg_get_function_result\(p\.oid\) <> 'void'/);
});

test("migration verifier detects malformed CASE expressions in function bodies", () => {
  const verifier = readFileSync("scripts/verify-migrations.mjs", "utf8");
  assert.match(verifier, /THEN\/ELSE\/END without CASE in a function body/);
});
