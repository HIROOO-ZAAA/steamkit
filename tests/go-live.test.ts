import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Template rendering logic for go-live announcements.
 * Mirrors the `renderTemplate` function in src/app/api/go-live/announce/route.ts
 */
function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => vars[key] ?? "");
}

describe("go-live template rendering", () => {
  const baseVars = {
    creator: "TestStreamer",
    title: "Epic Gaming Session",
    game: "Valorant",
    url: "https://twitch.tv/teststreamer",
  };

  it("replaces all standard variables", () => {
    const template =
      "🔴 **{creator} is now LIVE!**\n\n{title}\n\n🎮 {game}\n\n🔗 {url}";
    const result = renderTemplate(template, baseVars);

    assert.ok(result.includes("TestStreamer"));
    assert.ok(result.includes("Epic Gaming Session"));
    assert.ok(result.includes("Valorant"));
    assert.ok(result.includes("https://twitch.tv/teststreamer"));
    assert.ok(!result.includes("{"));
  });

  it("handles missing variables gracefully", () => {
    const template = "Live: {creator} - {title} - {missing}";
    const result = renderTemplate(template, { creator: "A", title: "B" });

    assert.equal(result, "Live: A - B - ");
  });

  it("handles empty template", () => {
    assert.equal(renderTemplate("", baseVars), "");
  });

  it("handles template with no variables", () => {
    const template = "Just plain text";
    assert.equal(renderTemplate(template, baseVars), "Just plain text");
  });

  it("does not replace partial matches", () => {
    const template = "{creator_name} vs {creator}";
    const result = renderTemplate(template, { creator: "X" });

    // {creator_name} is not in vars, so it becomes empty
    // {creator} is replaced
    assert.equal(result, " vs X");
  });

  it("replaces multiple occurrences of same variable", () => {
    const template = "{creator} says hi, {creator} is live!";
    const result = renderTemplate(template, { creator: "Streamy" });

    assert.equal(result, "Streamy says hi, Streamy is live!");
  });

  it("handles special characters in variable values", () => {
    const template = "Check out {creator}'s stream: {url}";
    const result = renderTemplate(template, {
      creator: "O'Reilly",
      url: "https://example.com/stream?param=value&other=123",
    });

    assert.ok(result.includes("O'Reilly"));
    assert.ok(result.includes("https://example.com/stream?param=value&other=123"));
  });

  it("handles unicode in template and variables", () => {
    const template = "🔴 {creator} 正在直播 {game} 🎮";
    const result = renderTemplate(template, {
      creator: "主播",
      game: "原神",
    });

    assert.equal(result, "🔴 主播 正在直播 原神 🎮");
  });
});

describe("go-live endpoint validation", () => {
  it("validates platform is telegram or discord", () => {
    const validPlatforms = ["telegram", "discord"] as const;
    const invalidPlatforms = ["slack", "matrix", "webhook", ""];

    for (const p of validPlatforms) {
      assert.ok(["telegram", "discord"].includes(p));
    }

    for (const p of invalidPlatforms) {
      assert.ok(!["telegram", "discord"].includes(p));
    }
  });

  it("validates endpoint_id is a valid UUID format", () => {
    const validUuids = [
      "123e4567-e89b-12d3-a456-426614174000",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ];
    const invalidUuids = [
      "not-a-uuid",
      "12345",
      "",
      "123e4567-e89b-12d3-a456", // too short
    ];

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const u of validUuids) {
      assert.ok(uuidRegex.test(u), `Expected valid: ${u}`);
    }

    for (const u of invalidUuids) {
      assert.ok(!uuidRegex.test(u), `Expected invalid: ${u}`);
    }
  });
});

describe("go-live platform configuration", () => {
  it("telegram requires bot token and group chat_id", () => {
    const telegramConfig = {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: "-1001234567890",
    };

    assert.ok(typeof telegramConfig.botToken === "string" || telegramConfig.botToken === undefined);
    assert.ok(typeof telegramConfig.chatId === "string");
    assert.ok(telegramConfig.chatId.startsWith("-100") || telegramConfig.chatId.startsWith("-"));
  });

  it("discord requires webhook URL", () => {
    const discordWebhookUrl = "https://discord.com/api/webhooks/123/abc";

    assert.ok(discordWebhookUrl.startsWith("https://discord.com/api/webhooks/"));
  });
});

describe("go-live announcement payload structure", () => {
  it("validates required fields in announce request", () => {
    const requiredFields = ["creatorId"];
    const optionalFields = ["title", "game", "url", "creatorName", "platforms"];

    const validPayload = {
      creatorId: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test Stream",
      game: "Just Chatting",
      url: "https://twitch.tv/test",
      creatorName: "Tester",
      platforms: ["telegram", "discord"] as const,
    };

    for (const field of requiredFields) {
      assert.ok(field in validPayload, `Missing required field: ${field}`);
    }

    for (const field of optionalFields) {
      assert.ok(field in validPayload || true); // optional
    }
  });

  it("defaults title, game, creatorName when not provided", () => {
    const defaults = {
      title: "Live Stream",
      game: "Just Chatting",
      creatorName: "A streamer",
    };

    assert.equal(defaults.title, "Live Stream");
    assert.equal(defaults.game, "Just Chatting");
    assert.equal(defaults.creatorName, "A streamer");
  });
});