import { describe, expect, it } from "vitest";
import { buildMonthlyBillPayload, peopleFromPreviousMonth } from "./monthlyBills.js";

const tariff = {
  id: "tariff-1",
  version: 2,
  effective_from: "2026-01-01",
  slabs: [{ units: 10, rate: 2 }, { units: null, rate: 5 }],
};

const people = [
  { id: "p1", name: "Anik", alias: "A.", ac: "4", color: "#000" },
  { id: "p2", name: "Debasis", alias: "D.", ac: "0", color: "#111" },
];

describe("monthly bill records", () => {
  it("stores the exact tariff and reconciled calculated rows", () => {
    const payload = buildMonthlyBillPayload({ year: 2026, month: 2, bill: "30", people, tariff });

    expect(payload.tariff_version_id).toBe("tariff-1");
    expect(payload.tariff_snapshot).toEqual(tariff.slabs);
    expect(payload.people_snapshot[0]).toMatchObject({ display_name: "Anik", public_alias: "A." });
    expect(payload.people_snapshot.reduce((sum, row) => sum + row.total_amount, 0)).toBeCloseTo(30, 10);
    expect(payload.status).toBe("draft");
  });

  it("copies only identities from the previous month", () => {
    const prior = { people_snapshot: [{ display_name: "Anik", public_alias: "A.", ac_units: 44 }] };
    expect(peopleFromPreviousMonth(prior)).toEqual([
      { id: 1, name: "Anik", alias: "A.", ac: "" },
    ]);
  });

  it("requires an explicit public alias instead of exposing the display name", () => {
    expect(() => buildMonthlyBillPayload({
      year: 2026,
      month: 2,
      bill: "30",
      people: [{ ...people[0], alias: "   " }],
      tariff,
    })).toThrow("Enter a public alias for every person.");
  });

  it("does not derive a missing previous-month alias from the display name", () => {
    const prior = { people_snapshot: [{ display_name: "Private Name", public_alias: "" }] };

    expect(peopleFromPreviousMonth(prior)[0].alias).toBe("");
  });

  it("rejects bill amounts with more than two decimal places", () => {
    expect(() => buildMonthlyBillPayload({
      year: 2026,
      month: 2,
      bill: "30.001",
      people,
      tariff,
    })).toThrow("at most two decimal places");
  });
});
