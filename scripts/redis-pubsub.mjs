// StreamKit Redis Pub/Sub Bridge
//
// Listens to Supabase Realtime (postgres_changes) and republishes events
// on Redis so the Next.js app can fan out to all overlay browser sources
// without depending on Supabase Realtime in the browser.
//
// Run: node scripts/redis-pubsub.mjs
// Required env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
// SUPABASE_SERVICE_ROLE_KEY, REDIS_URL

import { createClient } from "@supabase/supabase-js";
import { createClient as createRedis } from "redis";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REDIS_URL = process.env.REDIS_URL;

if (!SUPABASE_URL || !SUPABASE_KEY || !REDIS_URL) {
  console.error("[redis-pubsub] Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { heartbeatIntervalMs: 30_000, reconnectDelayMs: 2_000 },
});

const redis = createRedis({ url: REDIS_URL });
redis.on("error", (error) => console.error("[redis-pubsub] Redis error:", error));
await redis.connect();

const TABLE_MAP = {
  redeem_claims: "redeem_trigger",
  chat_messages: "chat_message",
  champions: "champion_update",
  alert_claims: "alert_claim",
  media_share_queue: "media_share",
  goal_manual_adjustments: "goal_update",
  leaderboard_snapshots: "leaderboard_update",
  tips: "donation",
  go_live_endpoints: "go_live",
};

function buildPayload(event) {
  const { eventType, new: newRecord, old: oldRecord, table } = event.payload;
  return {
    table,
    event: eventType,
    record: newRecord ?? oldRecord,
    old_record: eventType === "UPDATE" ? oldRecord : undefined,
    timestamp: Date.now(),
  };
}

for (const [table, channel] of Object.entries(TABLE_MAP)) {
  supabase.channel(`redis-bridge-${table}`).on(
    "postgres_changes",
    { event: "*", schema: "public", table },
    (payload) => {
      const data = buildPayload(payload);
      void redis.publish(channel, JSON.stringify(data)).catch((error) => {
        console.error(`[redis-pubsub] Failed to publish ${channel}:`, error);
      });
      console.log(`[redis-pubsub] ${table} -> ${channel}`);
    },
  );
}

supabase.subscribe();

async function shutdown() {
  console.log("[redis-pubsub] Shutting down...");
  await supabase.removeAllChannels();
  await redis.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[redis-pubsub] Bridge started - listening to", Object.keys(TABLE_MAP).length, "tables");
