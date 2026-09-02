import { describe, expect, it } from "vitest";
import { splitBill, unitsFromBill } from "./billMath.js";

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

  it("uses a supplied tariff snapshot for every calculation", () => {
    const tariff = [{ units: 10, rate: 2 }, { units: null, rate: 5 }];
    const people = [{ id: 1, name: "A", ac: "4" }, { id: 2, name: "B", ac: "0" }];

    expect(unitsFromBill(30, tariff)).toEqual([10, 2]);
    const result = splitBill("30", people, tariff);
    expect(result.tariffSnapshot).toEqual(tariff);
    expect(result.totalUnits).toBe(12);
    expect(result.acCost).toBe(14);
    expect(result.rows.reduce((sum, row) => sum + row.total, 0)).toBeCloseTo(30, 10);
  });
});
