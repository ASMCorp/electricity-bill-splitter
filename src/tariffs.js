import { SLABS } from "./billMath.js";

export const BUNDLED_TARIFF = {
  id: "bundled-default",
  version: 1,
  effective_from: "2025-01-01",
  label: "Bundled residential default",
  slabs: SLABS.map((slab) => ({
    units: slab.units === Infinity ? null : slab.units,
    rate: slab.rate,
  })),
};

export function currentTariff(versions, onDate = new Date().toISOString().slice(0, 10)) {
  const eligible = versions
    .filter((item) => item.effective_from <= onDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return eligible[0] || BUNDLED_TARIFF;
}

export function tariffForBillMonth(versions, year, month) {
  const monthStart = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const eligible = versions
    .filter((item) => item.effective_from <= monthStart)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return eligible[0] || null;
}

export function earliestTariffDateForNewVersion(bills) {
  if (!bills.length) return "";
  const latestMonth = Math.max(...bills.map((bill) => (
    Number(bill.bill_year) * 12 + Number(bill.bill_month) - 1
  )));
  const nextMonth = latestMonth + 1;
  const year = Math.floor(nextMonth / 12);
  const month = (nextMonth % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
