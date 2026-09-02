import { describe, expect, it } from "vitest";
import { BUNDLED_TARIFF, earliestTariffDateForNewVersion, tariffForBillMonth } from "./tariffs.js";

describe("tariff applicability", () => {
  it("returns no tariff before the first effective version", () => {
    expect(tariffForBillMonth([BUNDLED_TARIFF], 2024, 12)).toBeNull();
  });

  it("requires new tariffs to start after the latest recorded bill month", () => {
    expect(earliestTariffDateForNewVersion([
      { bill_year: 2026, bill_month: 8 },
      { bill_year: 2026, bill_month: 10 },
    ])).toBe("2026-11-01");
  });

  it("allows any date when no monthly bills exist", () => {
    expect(earliestTariffDateForNewVersion([])).toBe("");
  });
});
