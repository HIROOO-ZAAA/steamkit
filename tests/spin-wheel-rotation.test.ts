import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextSpinWheelRotation } from "../src/lib/overlay/spin-wheel-rotation.ts";

describe("nextSpinWheelRotation", () => {
  it("centers the selected slice under the fixed pointer", () => {
    for (const sliceCount of [2, 3, 4, 7, 12]) {
      const sliceAngle = 360 / sliceCount;
      for (let selectedIndex = 0; selectedIndex < sliceCount; selectedIndex += 1) {
        const rotation = nextSpinWheelRotation(0, selectedIndex, sliceCount);
        const pointerAngle = ((selectedIndex + 0.5) * sliceAngle + rotation) % 360;
        assert.ok(Math.min(pointerAngle, 360 - pointerAngle) < 1e-8);
      }
    }
  });

  it("keeps each subsequent spin moving forward from its current orientation", () => {
    const first = nextSpinWheelRotation(0, 1, 5);
    const second = nextSpinWheelRotation(first, 3, 5);

    assert.ok(second > first);
    const selectedCenter = ((3 + 0.5) * 72 + second) % 360;
    assert.ok(Math.min(selectedCenter, 360 - selectedCenter) < 1e-8);
  });

  it("leaves the current rotation unchanged when there are no slices", () => {
    assert.equal(nextSpinWheelRotation(720, 0, 0), 720);
  });
});
