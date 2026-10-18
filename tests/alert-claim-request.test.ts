import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createOverlayAlertClaimRequest } from "../src/lib/overlay/alert-claim-request.ts";

describe("overlay alert claim request", () => {
  it("sends only the overlay token and stable tip id to the claim endpoint", () => {
    const request = createOverlayAlertClaimRequest("overlay-token", "tip-uuid");
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.deepEqual(JSON.parse(String(request.body)), {
      overlayToken: "overlay-token",
      tipId: "tip-uuid",
    });
  });

  it("does not construct a request without the overlay token", () => {
    assert.equal(createOverlayAlertClaimRequest(null, "tip-uuid"), null);
    assert.equal(createOverlayAlertClaimRequest("", "tip-uuid"), null);
  });
});
