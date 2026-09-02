import { describe, expect, it } from "vitest";
import { buildMonthlyBillPayload, peopleFromPreviousMonth } from "./monthlyBills.js";

const tariff = {
  id: "tariff-1",
  version: 2,
  effective_from: "2026-01-01",
  slabs: [{ units: 10, rate: 2 }, { units: null, rate: 5 }],
};

const people = [
  { id: "p1", name: "Anik", ac: "4", color: "#000" },
  { id: "p2", name: "Debasis", ac: "0", color: "#111" },
];

describe("monthly bill records", () => {
  it("stores the exact tariff and reconciled calculated rows", () => {
    const payload = buildMonthlyBillPayload({ year: 2026, month: 2, bill: "30", people, tariff });

    expect(payload.tariff_version_id).toBe("tariff-1");
    expect(payload.tariff_snapshot).toEqual(tariff.slabs);
    expect(payload.people_snapshot[0]).toMatchObject({ member_id: "p1", display_name: "Anik", public_alias: "Anik" });
    expect(payload.people_snapshot.reduce((sum, row) => sum + row.total_amount, 0)).toBeCloseTo(30, 10);
    expect(payload.status).toBe("draft");
  });

  it("copies only identities from the previous month", () => {
    const prior = { people_snapshot: [{ display_name: "Anik", public_alias: "A.", ac_units: 44 }] };
    expect(peopleFromPreviousMonth(prior)).toEqual([
      { id: 1, name: "Anik", ac: "" },
    ]);
  });

  it("uses a member name for the compatibility snapshot field", () => {
    const payload = buildMonthlyBillPayload({
      year: 2026,
      month: 2,
      bill: "30",
      people: [people[0]],
      tariff,
    });
    expect(payload.people_snapshot[0].public_alias).toBe("Anik");
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
