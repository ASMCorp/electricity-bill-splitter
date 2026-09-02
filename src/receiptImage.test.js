import { describe, expect, it } from "vitest";
import { activeSlabs } from "./receiptImage.js";

describe("receipt image helpers", () => {
  it("assigns a color to every active tariff slab", () => {
    const slabCount = 8;
    const result = {
      tariffSnapshot: Array.from({ length: slabCount }, () => ({ units: 1, rate: 1 })),
      perSlab: Array.from({ length: slabCount }, () => 1),
      acPerSlab: Array.from({ length: slabCount }, () => 0),
    };

    expect(activeSlabs(result)).toHaveLength(slabCount);
    expect(activeSlabs(result).every((slab) => typeof slab.color === "string")).toBe(true);
  });
});
