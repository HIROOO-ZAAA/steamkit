import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  parseYouTubeVideoId,
  parseISODuration,
  getYouTubeEmbedUrl,
} from "../src/lib/mediashare/youtube.ts";
import {
  formatMediaShareSSEEvent,
  subscribeMediaShare,
  broadcastMediaShare,
} from "../src/lib/mediashare/sse.ts";

describe("YouTube URL & ID parser", () => {
  it("extracts ID from standard watch URL", () => {
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      "dQw4w9WgXcQ"
    );
  });

  it("extracts ID from youtu.be short URL", () => {
    assert.equal(
      parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ"
    );
  });

  it("extracts ID from embed and shorts URLs", () => {
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ"
    );
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ"
    );
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ"
    );
  });

  it("extracts ID when query parameters include timestamp and playlist", () => {
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123"),
      "dQw4w9WgXcQ"
    );
  });

  it("accepts a raw valid 11-character video ID", () => {
    assert.equal(parseYouTubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("rejects invalid URLs, non-YouTube domains, and empty inputs", () => {
    assert.equal(parseYouTubeVideoId(""), null);
    assert.equal(parseYouTubeVideoId("https://vimeo.com/12345678"), null);
    assert.equal(parseYouTubeVideoId("https://youtube.com/watch?v=short"), null);
    assert.equal(parseYouTubeVideoId("not a url"), null);
  });
});

describe("ISO 8601 Duration parser", () => {
  it("parses seconds only", () => {
    assert.equal(parseISODuration("PT45S"), 45);
  });

  it("parses minutes and seconds", () => {
    assert.equal(parseISODuration("PT3M33S"), 213);
  });

  it("parses hours, minutes, and seconds", () => {
    assert.equal(parseISODuration("PT1H2M10S"), 3730);
  });

  it("parses hours only", () => {
    assert.equal(parseISODuration("PT2H"), 7200);
  });

  it("handles days and hours", () => {
    assert.equal(parseISODuration("P1DT2H"), 93600);
  });

  it("returns 0 on empty or invalid input", () => {
    assert.equal(parseISODuration(""), 0);
    assert.equal(parseISODuration("invalid"), 0);
  });
});

describe("YouTube Embed URL Generator", () => {
  it("generates privacy-enhanced embed URL with autoplay and JS API enabled", () => {
    const url = getYouTubeEmbedUrl("dQw4w9WgXcQ");
    assert.match(url, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    assert.match(url, /autoplay=1/);
    assert.match(url, /enablejsapi=1/);
    assert.match(url, /controls=0/);
  });
});

describe("SSE Event Formatting & Dispatching", () => {
  it("formats SSE chunks with event type 'media_share' and valid JSON data", () => {
    const event = formatMediaShareSSEEvent({
      type: "play",
      item: {
        id: "test-id",
        youtube_video_id: "dQw4w9WgXcQ",
        duration_seconds: 120,
        tipper_name: "Donor",
      },
    });

    assert.ok(event.startsWith("event: media_share\n"));
    assert.ok(event.endsWith("\n\n"));

    const lines = event.split("\n");
    const dataLine = lines.find((l) => l.startsWith("data: "));
    assert.ok(dataLine, "data line must exist");

    const parsed = JSON.parse(dataLine.replace("data: ", ""));
    assert.equal(parsed.type, "play");
    assert.equal(parsed.item.id, "test-id");
    assert.equal(parsed.item.youtube_video_id, "dQw4w9WgXcQ");
    assert.ok(typeof parsed.timestamp === "number");
  });

  it("broadcasts media_share events only to subscribers of the matching creator", () => {
    const creatorA = "11111111-1111-1111-1111-111111111111";
    const creatorB = "22222222-2222-2222-2222-222222222222";

    const receivedA: string[] = [];
    const receivedB: string[] = [];

    const unsubA = subscribeMediaShare(creatorA, (chunk) => receivedA.push(chunk));
    const unsubB = subscribeMediaShare(creatorB, (chunk) => receivedB.push(chunk));

    broadcastMediaShare(creatorA, { type: "skip", id: "item-1" });

    assert.equal(receivedA.length, 1);
    assert.ok(receivedA[0].includes("event: media_share"));
    assert.ok(receivedA[0].includes('"type":"skip"'));
    assert.equal(receivedB.length, 0, "creator B should not receive creator A events");

    unsubA();
    unsubB();

    broadcastMediaShare(creatorA, { type: "play", id: "item-2" });
    assert.equal(receivedA.length, 1, "unsubscribed listener should not receive subsequent events");
  });
});

describe("Media Share Migration Verification", () => {
  it("contains media_share table with RLS enabled and required columns", () => {
    const sql = readFileSync("supabase/migrations/20261118000001_media_share.sql", "utf8");
    assert.match(sql, /create table if not exists public\.media_share/i);
    assert.match(sql, /alter table public\.media_share enable row level security/i);
    assert.match(sql, /creator_id uuid references auth\.users\(id\)/i);
    assert.match(sql, /youtube_video_id text not null/i);
    assert.match(sql, /duration_seconds integer/i);
    assert.match(sql, /check \(status in \('pending', 'playing', 'played', 'skipped', 'cancelled'\)\)/i);
    assert.match(sql, /create policy "Creators manage own media share"/i);
    assert.match(sql, /create or replace view public\.media_share_queue/i);
  });
});
