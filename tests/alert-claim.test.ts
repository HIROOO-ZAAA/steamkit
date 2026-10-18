import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claimAlertOnce } from "../src/lib/overlay/alert-claim.ts";

describe("overlay alert idempotency", () => {
  it("coalesces concurrent duplicate deliveries before the database claim", async () => {
    let databaseClaims = 0;
    let release!: (claimed: boolean) => void;
    const databaseClaim = () => {
      databaseClaims += 1;
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    };

    const first = claimAlertOnce("tip-1", databaseClaim);
    const duplicate = await claimAlertOnce("tip-1", databaseClaim);
    assert.equal(duplicate, false);
    assert.equal(databaseClaims, 1);

    release(true);
    assert.equal(await first, true);
  });

  it("allows a later retry when the authoritative database claim did not succeed", async () => {
    let attempts = 0;
    assert.equal(await claimAlertOnce("tip-2", async () => ++attempts > 1), false);
    assert.equal(await claimAlertOnce("tip-2", async () => ++attempts > 1), true);
    assert.equal(attempts, 2);
  });

  it("does not collapse two distinct donations into one claim", async () => {
    const claimedIds = new Set<string>();
    const claim = (id: string) => claimAlertOnce(id, async () => {
      if (claimedIds.has(id)) return false;
      claimedIds.add(id);
      return true;
    });

    assert.equal(await claim("tip-a"), true);
    assert.equal(await claim("tip-b"), true);
    assert.equal(await claim("tip-a"), false);
  });
});
