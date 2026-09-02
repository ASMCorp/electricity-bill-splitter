import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "supabase/migrations/202609020001_monthly_billing.sql");
const migration = readFileSync(migrationPath, "utf8");
const membersMigrationPath = join(process.cwd(), "supabase/migrations/202609020002_members.sql");
const tariffLifecycleMigrationPath = join(process.cwd(), "supabase/migrations/202609020003_tariff_lifecycle.sql");

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

describe("member roster migration", () => {
  it("stores members with soft removal and admin-only writes", () => {
    const membersMigration = readFileSync(membersMigrationPath, "utf8").toLowerCase();

    expect(membersMigration).toContain("create table public.members");
    expect(membersMigration).toContain("public_alias text not null");
    expect(membersMigration).toContain("is_active boolean not null default true");
    expect(membersMigration).toContain("members_admin_insert");
    expect(membersMigration).toContain("members_admin_update");
    expect(membersMigration).not.toContain("members_admin_delete");
  });

  it("serializes roster writes and rejects stale bill snapshots", () => {
    const membersMigration = readFileSync(membersMigrationPath, "utf8").toLowerCase();

    expect(membersMigration).toContain("perform pg_advisory_xact_lock(1163284053)");
    expect(membersMigration).toContain("create or replace function public.validate_monthly_bill_roster()");
    expect(membersMigration).toContain("jsonb_array_elements(new.people_snapshot)");
    expect(membersMigration).toContain("m.id::text = person ->> 'member_id'");
    expect(membersMigration).toContain("m.display_name = person ->> 'display_name'");
    expect(membersMigration).toContain("m.public_alias = person ->> 'public_alias'");
    expect(membersMigration).toContain("create trigger monthly_bills_00_validate_roster");
  });
});

describe("tariff version lifecycle migration", () => {
  it("allows admins to delete only unused future tariff versions", () => {
    const tariffMigration = readFileSync(tariffLifecycleMigrationPath, "utf8").toLowerCase();

    expect(tariffMigration).toContain("tariffs_admin_delete");
    expect(tariffMigration).toContain("grant delete on public.tariff_versions to authenticated");
    expect(tariffMigration).toContain("old.effective_from <= current_date");
    expect(tariffMigration).toContain("from public.monthly_bills");
    expect(tariffMigration).toContain("tariff_version_id = old.id");
    expect(tariffMigration).toContain("tariff versions cannot be updated");
  });
});
