import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createOverlaySynthesisRequest } from "../src/lib/overlay/tts-request.ts";

describe("overlay synthesis request", () => {
  it("includes the validated overlay token in the authenticated API body", () => {
    const request = createOverlaySynthesisRequest("test-overlay-token", "hello", "payment-1");

    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.deepEqual(request.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(request.body)), {
      overlayToken: "test-overlay-token",
      text: "hello",
      donationId: "payment-1",
      requireClone: false,
    });
  });

  it("marks cloned speech as required when the selected clone must speak", () => {
    const request = createOverlaySynthesisRequest("token", "hello", "payment-1", true);
    assert.ok(request);
    assert.equal(JSON.parse(String(request.body)).requireClone, true);
  });

  it("does not create a request when the overlay token is unavailable", () => {
    assert.equal(createOverlaySynthesisRequest(null, "hello"), null);
    assert.equal(createOverlaySynthesisRequest("", "hello"), null);
  });
});
