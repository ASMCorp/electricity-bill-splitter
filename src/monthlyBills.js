import { splitBill } from "./billMath.js";

export function buildMonthlyBillPayload({ year, month, bill, people, tariff }) {
  if (!tariff?.id || !Array.isArray(tariff.slabs)) throw new Error("A tariff version is required.");
  const normalizedBill = String(bill).replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedBill)) {
    throw new Error("Bill amount must use at most two decimal places.");
  }
  const result = splitBill(normalizedBill, people, tariff.slabs);
  if (result.bill <= 0) throw new Error("Bill amount must be greater than zero.");
  if (!people.length) throw new Error("At least one person is required.");


  return {
    bill_year: Number(year),
    bill_month: Number(month),
    total_bill: result.bill,
    status: "draft",
    tariff_version_id: tariff.id,
    tariff_snapshot: result.tariffSnapshot,
    calculation_snapshot: {
      total_units: result.totalUnits,
      ac_units: result.acUnits,
      ac_cost: result.acCost,
      shared_per_person: result.sharedPerPerson,
      capped: result.capped,
    },
    people_snapshot: result.rows.map((row, index) => ({
      position: index,
      member_id: row.id,
      display_name: row.name,
      // Kept for compatibility with existing snapshot validation. Public
      // records now expose display_name directly instead of this field.
      public_alias: row.name,
      color: row.color || people[index].color || null,
      ac_units: row.u,
      ac_amount: row.ac,
      shared_amount: row.shared,
      total_amount: row.total,
    })),
  };
}

export function peopleFromPreviousMonth(previousBill) {
  return (previousBill?.people_snapshot || []).map((person, index) => ({
    id: index + 1,
    name: person.display_name,
    ac: "",
  }));
}
