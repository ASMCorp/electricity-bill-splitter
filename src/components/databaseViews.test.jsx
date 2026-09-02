import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MonthlyBills from "./MonthlyBills.jsx";
import Admin from "./Admin.jsx";
import Transparency from "./Transparency.jsx";
import { BUNDLED_TARIFF, tariffForBillMonth } from "../tariffs.js";

it("selects the latest tariff effective on or before the bill month starts", () => {
  const tariffs = [
    { ...BUNDLED_TARIFF, id: "march", effective_from: "2026-03-01" },
    { ...BUNDLED_TARIFF, id: "february", effective_from: "2026-02-01" },
    { ...BUNDLED_TARIFF, id: "mid-january", effective_from: "2026-01-15" },
    { ...BUNDLED_TARIFF, id: "old", effective_from: "2025-01-01" },
  ];

  expect(tariffForBillMonth(tariffs, 2026, 2).id).toBe("february");
  expect(tariffForBillMonth(tariffs, 2026, 1).id).toBe("old");
});

it("shows the tariff effective today instead of a future version", () => {
  const tariffs = [
    { ...BUNDLED_TARIFF, id: "future", version: 3, effective_from: "2999-01-01", label: "Future" },
    { ...BUNDLED_TARIFF, id: "current", version: 2, effective_from: "2026-01-01", label: "Current" },
  ];

  render(<Transparency tariffs={tariffs} usingBundled={false} />);

  const currentSection = screen.getByRole("heading", { name: "Current slab pricing" }).closest("section");
  expect(within(currentSection).getByText("Current")).toBeInTheDocument();
  expect(within(currentSection).getByText(/effective 2026-01-01/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Pricing version history" }).parentElement).toHaveTextContent("Future");
});

it("shows only published record aliases and opens month details", async () => {
  const bills = [{ id: "b1", bill_year: 2026, bill_month: 1, total_bill: 100, people_snapshot: [{ position: 0, display_name: "Private Full Name", public_alias: "P.", ac_units: 2, total_amount: 100 }] }];
  render(<MonthlyBills configured loading={false} error="" bills={bills} />);
  expect(screen.getByText("P.")).toBeInTheDocument();
  expect(screen.queryByText("Private Full Name")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Monthly bill details" })).toHaveTextContent("January 2026");
});

describe("admin authorization", () => {
  it("keeps published records read-only until they are reopened", async () => {
    const user = userEvent.setup();
    const published = {
      id: "bill-1",
      bill_year: 2026,
      bill_month: 1,
      total_bill: 100,
      status: "published",
      tariff_version_id: BUNDLED_TARIFF.id,
      people_snapshot: [{ display_name: "Anik", public_alias: "A.", ac_units: 0 }],
    };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([published]),
      signOut: vi.fn().mockResolvedValue(undefined),
      saveDraft: vi.fn(),
      setBillStatus: vi.fn(),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /2026-01 · published/i }));

    expect(screen.getByRole("heading", { name: "View published bill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "New monthly bill" }));
    expect(screen.getByRole("heading", { name: "New monthly bill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(screen.getByLabelText("Admin total bill")).toHaveValue("");
  });

  it("rejects an authenticated non-admin instead of showing write controls", async () => {
    const user = userEvent.setup();
    const database = {
      session: vi.fn().mockResolvedValue(null),
      signIn: vi.fn().mockResolvedValue({ session: { user: { id: "user-1" } } }),
      isAdmin: vi.fn().mockResolvedValue(false),
      signOut: vi.fn().mockResolvedValue(undefined),
    };
    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not an authorized administrator");
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(database.signOut).toHaveBeenCalled();
  });

  it("uses only the latest tariff effective by the first day of the bill month", async () => {
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
    };
    const tariffs = [
      { ...BUNDLED_TARIFF, id: "future", version: 3, effective_from: "2999-01-01" },
      { ...BUNDLED_TARIFF, id: "eligible", version: 2, effective_from: "2025-01-01" },
    ];

    render(<Admin configured database={database} tariffs={tariffs} onTariffCreated={vi.fn()} />);

    expect(await screen.findByLabelText("Tariff version")).toHaveValue("eligible");
    expect(screen.getByRole("option", { name: /v3/i })).toBeDisabled();
  });

  it("disables saving when the bill month has no applicable tariff", async () => {
    const user = userEvent.setup();
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await screen.findByRole("heading", { name: "Monthly billing admin" });
    await user.clear(screen.getByLabelText("Year"));
    await user.type(screen.getByLabelText("Year"), "2024");

    expect(screen.getByRole("status")).toHaveTextContent("No tariff applies");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("refreshes public bills after publishing or reopening", async () => {
    const user = userEvent.setup();
    const draft = {
      id: "bill-1",
      bill_year: 2026,
      bill_month: 1,
      total_bill: 100,
      status: "draft",
      tariff_version_id: BUNDLED_TARIFF.id,
      people_snapshot: [{ display_name: "Anik", public_alias: "A.", ac_units: 0 }],
    };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([draft]),
      setBillStatus: vi.fn().mockResolvedValue({ ...draft, status: "published" }),
    };
    const onBillsChanged = vi.fn().mockResolvedValue(undefined);
    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} onBillsChanged={onBillsChanged} />);

    await user.click(await screen.findByRole("button", { name: "Publish" }));

    expect(onBillsChanged).toHaveBeenCalledOnce();
  });
});
