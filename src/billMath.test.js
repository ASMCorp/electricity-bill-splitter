import { describe, expect, it } from "vitest";
import { splitBill } from "./billMath.js";

describe("splitBill", () => {
  it("caps oversized AC readings without collecting more than the bill", () => {
    const result = splitBill("100", [
      { id: 1, name: "Anik", ac: "20" },
      { id: 2, name: "Debasis", ac: "20" },
    ]);

    expect(result.rows.reduce((sum, person) => sum + person.u, 0)).toBeCloseTo(result.totalUnits, 8);
    expect(result.rows.reduce((sum, person) => sum + person.total, 0)).toBeCloseTo(result.bill, 8);
    expect(result.capped).toBe(true);
  });
});
