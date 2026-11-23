import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import test from "node:test";

const integrationEnabled = process.env.RUN_FAN_POINTS_INTEGRATION === "1";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for fan-points integration tests`);
  return value;
}

async function createTestUser(url: string, serviceKey: string, label: string) {
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.admin.createUser({
    email: `${label}-${randomUUID()}@example.test`,
    email_confirm: true,
    user_metadata: { display_name: label },
  });
  if (error) throw error;
  if (!data.user) throw new Error(`Could not create ${label} test user`);
  return data.user.id;
}

test(
  "fan points and redeem flows",
  { skip: integrationEnabled ? false : "set RUN_FAN_POINTS_INTEGRATION=1 with live test credentials" },
  async (t) => {
    const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let creatorId: string | undefined;
    let subscriberId: string | undefined;
    const redeemIds: string[] = [];

    try {
      creatorId = await createTestUser(url, serviceKey, "fan-points-creator");
      subscriberId = await createTestUser(url, serviceKey, "fan-points-subscriber");
      t.diagnostic("test users created");

      const khrAward = await supabase.rpc("award_fan_points_on_donation", {
        p_creator_id: creatorId,
        p_subscriber_id: subscriberId,
        p_amount_khr: 5000,
        p_amount_usd: 0,
        p_payment_id: randomUUID(),
      });
      assert.ifError(khrAward.error);
      assert.equal(khrAward.data, 50000);

      const usdAward = await supabase.rpc("award_fan_points_on_donation", {
        p_creator_id: creatorId,
        p_subscriber_id: subscriberId,
        p_amount_khr: 0,
        p_amount_usd: 1.5,
        p_payment_id: randomUUID(),
      });
      assert.ifError(usdAward.error);
      assert.equal(usdAward.data, 60000);

      const balance = await supabase
        .from("fan_points")
        .select("balance, total_earned, total_spent")
        .eq("creator_id", creatorId)
        .eq("subscriber_id", subscriberId)
        .single();
      assert.ifError(balance.error);
      assert.equal(balance.data.balance, 110000);
      assert.equal(balance.data.total_earned, 110000);
      assert.equal(balance.data.total_spent, 0);

      const redeem = await supabase
        .from("redeems")
        .insert({
          creator_id: creatorId,
          title: "Custom Shoutout",
          description: "Get a personalized shoutout on stream",
          type: "text",
          cost: 10000,
          cooldown_seconds: 60,
          max_per_stream: 5,
          max_per_user_per_stream: 1,
          config: { display_duration: 8000, color: "#ff6b6b" },
          status: "active",
        })
        .select()
        .single();
      assert.ifError(redeem.error);
      assert.ok(redeem.data);
      redeemIds.push(redeem.data.id);

      const spend = await supabase.rpc("spend_fan_points", {
        p_redeem_id: redeem.data.id,
        p_subscriber_id: subscriberId,
        p_input_text: "Happy birthday!",
        p_input_data: { emoji: "🎉" },
      });
      assert.ifError(spend.error);
      assert.equal(spend.data.status, "pending");
      assert.equal(spend.data.new_balance, 100000);

      const spentBalance = await supabase
        .from("fan_points")
        .select("balance, total_earned, total_spent")
        .eq("creator_id", creatorId)
        .eq("subscriber_id", subscriberId)
        .single();
      assert.ifError(spentBalance.error);
      assert.equal(spentBalance.data.balance, 100000);
      assert.equal(spentBalance.data.total_spent, 10000);

      const insufficient = await supabase.rpc("spend_fan_points", {
        p_redeem_id: redeem.data.id,
        p_subscriber_id: subscriberId,
      });
      assert.ok(insufficient.error, "insufficient balance should be rejected");

      const cheapRedeem = await supabase
        .from("redeems")
        .insert({
          creator_id: creatorId,
          title: "Quick Emote",
          type: "text",
          cost: 1000,
          cooldown_seconds: 10,
          status: "active",
        })
        .select()
        .single();
      assert.ifError(cheapRedeem.error);
      assert.ok(cheapRedeem.data);
      redeemIds.push(cheapRedeem.data.id);

      const firstCheapSpend = await supabase.rpc("spend_fan_points", {
        p_redeem_id: cheapRedeem.data.id,
        p_subscriber_id: subscriberId,
      });
      assert.ifError(firstCheapSpend.error);
      assert.ok(firstCheapSpend.data);

      const cooldownSpend = await supabase.rpc("spend_fan_points", {
        p_redeem_id: cheapRedeem.data.id,
        p_subscriber_id: subscriberId,
      });
      assert.ok(cooldownSpend.error, "cooldown should be enforced");

      const limitedRedeem = await supabase
        .from("redeems")
        .insert({
          creator_id: creatorId,
          title: "Limited Redeem",
          type: "text",
          cost: 1000,
          max_per_stream: 2,
          status: "active",
        })
        .select()
        .single();
      assert.ifError(limitedRedeem.error);
      assert.ok(limitedRedeem.data);
      redeemIds.push(limitedRedeem.data.id);

      for (let i = 0; i < 2; i++) {
        const limitedSpend = await supabase.rpc("spend_fan_points", {
          p_redeem_id: limitedRedeem.data.id,
          p_subscriber_id: subscriberId,
        });
        assert.ifError(limitedSpend.error);
      }

      const overLimitSpend = await supabase.rpc("spend_fan_points", {
        p_redeem_id: limitedRedeem.data.id,
        p_subscriber_id: subscriberId,
      });
      assert.ok(overLimitSpend.error, "per-stream limit should be enforced");

      const missingRedeem = await supabase.rpc("spend_fan_points", {
        p_redeem_id: randomUUID(),
        p_subscriber_id: subscriberId,
      });
      assert.ok(missingRedeem.error, "missing redeem should be rejected");

      const pausedRedeem = await supabase
        .from("redeems")
        .insert({
          creator_id: creatorId,
          title: "Paused Redeem",
          type: "text",
          cost: 1000,
          status: "paused",
        })
        .select()
        .single();
      assert.ifError(pausedRedeem.error);
      assert.ok(pausedRedeem.data);
      redeemIds.push(pausedRedeem.data.id);

      const pausedSpend = await supabase.rpc("spend_fan_points", {
        p_redeem_id: pausedRedeem.data.id,
        p_subscriber_id: subscriberId,
      });
      assert.ok(pausedSpend.error, "inactive redeem should be rejected");

      const policies = await supabase
        .from("pg_policies")
        .select("*")
        .eq("tablename", "redeems");
      t.diagnostic(`redeem RLS policies visible: ${policies.data?.length ?? 0}`);
    } finally {
      if (subscriberId) {
        await supabase.from("redeem_claims").delete().eq("subscriber_id", subscriberId);
      }
      if (redeemIds.length > 0) {
        await supabase.from("redeems").delete().in("id", redeemIds);
      }
      if (creatorId && subscriberId) {
        await supabase
          .from("fan_points")
          .delete()
          .eq("creator_id", creatorId)
          .eq("subscriber_id", subscriberId);
      }
      if (subscriberId) await supabase.auth.admin.deleteUser(subscriberId);
      if (creatorId) await supabase.auth.admin.deleteUser(creatorId);
      t.diagnostic("test-scoped cleanup complete");
    }
  },
);
