import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "supabase/migrations/202609020001_monthly_billing.sql");
const migration = readFileSync(migrationPath, "utf8");

function functionBody(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`, "i"));
  expect(match, `${name} should exist`).not.toBeNull();
  return match[1];
}

describe("tariff applicability write serialization", () => {
  it("takes the same transaction lock before either tariff or bill validation", () => {
    const tariffBody = functionBody("prevent_tariff_backdating");
    const billBody = functionBody("validate_monthly_bill");
    const lock = "perform pg_advisory_xact_lock(1163284052);";

    expect(tariffBody.toLowerCase()).toContain(lock);
    expect(billBody.toLowerCase()).toContain(lock);
    expect(tariffBody.toLowerCase().indexOf(lock)).toBeLessThan(tariffBody.toLowerCase().indexOf("if exists"));
    expect(billBody.toLowerCase().indexOf(lock)).toBeLessThan(billBody.toLowerCase().indexOf("select id, slabs into expected_tariff_id"));
  });
});
