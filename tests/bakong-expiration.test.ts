import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as bakongPackage from "bakong-khqr";

interface BakongRuntime {
  BakongKHQR: {
    new (): {
      generateIndividual(info: unknown): {
        status: { code: number };
        data: { qr: string } | null;
      };
    };
    verify(qr: string): { isValid: boolean };
  };
  IndividualInfo: new (...args: unknown[]) => unknown;
  khqrData: { currency: { khr: number } };
}

const sdk = bakongPackage as unknown as BakongRuntime;

const khqrRoute = readFileSync("src/app/api/payments/khqr/route.ts", "utf8");

test("dynamic Bakong KHQR is valid and application expiry is tracked separately", () => {
  const info = new sdk.IndividualInfo(
    "test_bakong@devb",
    "Test Merchant",
    "PHNOM PENH",
    {
      currency: sdk.khqrData.currency.khr,
      amount: 500,
      billNumber: "SKTEST",
      storeLabel: "Kit Steam",
      terminalLabel: "Web Tip",
      merchantCategoryCode: "5999",
    },
  );

  const result = new sdk.BakongKHQR().generateIndividual(info);
  assert.equal(result.status.code, 0);
  assert.ok(result.data);
  assert.equal(sdk.BakongKHQR.verify(result.data.qr).isValid, true);

  assert.match(khqrRoute, /new Date\(Date\.now\(\) \+ 5 \* 60 \* 1000\)/);
  assert.match(khqrRoute, /generateDynamicKhqr\(\{[\s\S]*?expiresAt,/);
  assert.match(khqrRoute, /expires_at:\s*expiresAt\.toISOString\(\)/);
  assert.match(khqrRoute, /expiresAt:\s*expiresAt\.toISOString\(\)/);
});
