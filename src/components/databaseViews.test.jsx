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
  it("lists tariffs and deletes only an unused future version after confirmation", async () => {
    const user = userEvent.setup();
    const currentTariff = { ...BUNDLED_TARIFF, id: "current", version: 1, label: "Current", effective_from: "2025-01-01" };
    const futureTariff = { ...BUNDLED_TARIFF, id: "future", version: 2, label: "Future", effective_from: "2999-01-01" };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([]),
      deleteTariff: vi.fn().mockResolvedValue({ id: "future" }),
      tariffVersions: vi.fn().mockResolvedValue([currentTariff]),
    };
    const onTariffsChanged = vi.fn();

    render(<Admin configured database={database} tariffs={[futureTariff, currentTariff]} onTariffCreated={vi.fn()} onTariffsChanged={onTariffsChanged} />);
    expect(await screen.findByRole("heading", { name: "Tariff version history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Current" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Future" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete Future" }));

    expect(database.deleteTariff).toHaveBeenCalledWith("future");
    expect(database.tariffVersions).toHaveBeenCalledOnce();
    expect(onTariffsChanged).toHaveBeenCalledWith([currentTariff]);
  });

  it("loads an existing tariff as a new-version template", async () => {
    const user = userEvent.setup();
    const customTariff = {
      ...BUNDLED_TARIFF,
      id: "custom",
      version: 4,
      label: "Custom",
      slabs: [{ units: 100, rate: 1 }, { units: 50, rate: 2 }, { units: null, rate: 3 }],
    };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([]),
    };

    render(<Admin configured database={database} tariffs={[customTariff]} onTariffCreated={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Copy Custom into new version" }));

    expect(screen.getByLabelText("Version label")).toHaveValue("Custom copy");
    expect(screen.getByLabelText("Effective date")).toHaveValue("");
    expect(screen.getByLabelText("Upper limit for slab 1")).toHaveValue(100);
    expect(screen.getByLabelText("Upper limit for slab 2")).toHaveValue(150);
    expect(screen.getByLabelText("Rate for slab 3")).toHaveValue(3);
  });

  it("creates a tariff from clear slab ranges and prices", async () => {
    const user = userEvent.setup();
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([]),
      createTariff: vi.fn().mockResolvedValue({ id: "tariff-2" }),
    };
    const onTariffCreated = vi.fn();

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={onTariffCreated} />);
    await screen.findByRole("heading", { name: "Create tariff version" });

    expect(screen.getByLabelText("Upper limit for slab 1")).toHaveValue(75);
    expect(screen.getByLabelText("Rate for slab 1")).toHaveValue(6.18);
    await user.click(screen.getByRole("button", { name: "Add slab" }));
    await user.type(screen.getByLabelText("Upper limit for slab 6"), "700");
    await user.type(screen.getByLabelText("Rate for slab 6"), "16");
    await user.type(screen.getByLabelText("Version label"), "Updated tariff");
    await user.type(screen.getByLabelText("Effective date"), "2026-01-01");
    await user.click(screen.getByRole("button", { name: "Create version" }));

    expect(database.createTariff).toHaveBeenCalledWith({
      label: "Updated tariff",
      effective_from: "2026-01-01",
      slabs: [
        { units: 75, rate: 6.18 },
        { units: 124, rate: 8.5 },
        { units: 99, rate: 9.1 },
        { units: 99, rate: 9.62 },
        { units: 199, rate: 15.01 },
        { units: 104, rate: 16 },
        { units: null, rate: 17.35 },
      ],
    });
    expect(onTariffCreated).toHaveBeenCalledWith({ id: "tariff-2" });
  });

  it("starts with an empty roster and blocks monthly calculation", async () => {
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([]),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);

    expect(await screen.findByText("No members yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calculate split" })).toBeDisabled();
  });

  it("adds a roster member to every new monthly bill", async () => {
    const user = userEvent.setup();
    const created = { id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([]),
      createMember: vi.fn().mockResolvedValue(created),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText("New member name"), "Anik");
    await user.type(screen.getByLabelText("New member public alias"), "A.");
    await user.click(screen.getByRole("button", { name: "Add member" }));

    expect(database.createMember).toHaveBeenCalledWith({ display_name: "Anik", public_alias: "A." });
    expect(screen.getByLabelText("AC units for Anik")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calculate split" })).toBeEnabled();
  });

  it("soft removes and restores a roster member", async () => {
    const user = userEvent.setup();
    const active = { id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([active]),
      updateMember: vi.fn()
        .mockResolvedValueOnce({ ...active, is_active: false })
        .mockResolvedValueOnce(active),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Remove Anik" }));

    expect(database.updateMember).toHaveBeenLastCalledWith("member-1", { is_active: false });
    expect(screen.queryByLabelText("AC units for Anik")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore Anik" }));
    expect(database.updateMember).toHaveBeenLastCalledWith("member-1", { is_active: true });
    expect(screen.getByLabelText("AC units for Anik")).toBeInTheDocument();
  });

  it("renames an active member in the roster and new bill", async () => {
    const user = userEvent.setup();
    const active = { id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([active]),
      updateMember: vi.fn().mockResolvedValue({ ...active, display_name: "Anik S." }),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    const name = await screen.findByLabelText("Member name for Anik");
    await user.clear(name);
    await user.type(name, "Anik S.");
    await user.click(screen.getByRole("button", { name: "Save Anik" }));

    expect(database.updateMember).toHaveBeenCalledWith("member-1", { display_name: "Anik S.", public_alias: "A." });
    expect(screen.getByLabelText("AC units for Anik S.")).toBeInTheDocument();
  });

  it("calculates the roster split before saving a draft", async () => {
    const user = userEvent.setup();
    const members = [
      { id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true },
      { id: "member-2", display_name: "Debasis", public_alias: "D.", is_active: true },
    ];
    const saved = { id: "bill-1", status: "draft", bill_year: 2026, bill_month: 1 };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue(members),
      saveDraft: vi.fn().mockResolvedValue(saved),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText("Admin total bill"), "30");
    await user.type(screen.getByLabelText("AC units for Anik"), "1");
    await user.click(screen.getByRole("button", { name: "Calculate split" }));

    expect(screen.getByRole("region", { name: "Calculated split" })).toHaveTextContent("A.");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(database.saveDraft).toHaveBeenCalledOnce();
    expect(database.saveDraft.mock.calls[0][0].people_snapshot).toHaveLength(2);
  });

  it("invalidates a calculated split when the roster changes", async () => {
    const user = userEvent.setup();
    const existing = { id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true };
    const created = { id: "member-2", display_name: "Debasis", public_alias: "D.", is_active: true };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([existing]),
      createMember: vi.fn().mockResolvedValue(created),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText("Admin total bill"), "30");
    await user.click(screen.getByRole("button", { name: "Calculate split" }));
    expect(screen.getByRole("region", { name: "Calculated split" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("New member name"), "Debasis");
    await user.type(screen.getByLabelText("New member public alias"), "D.");
    await user.click(screen.getByRole("button", { name: "Add member" }));

    expect(screen.queryByRole("region", { name: "Calculated split" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calculate split" })).toBeEnabled();
  });

  it("invalidates a calculated split when the applicable tariff changes", async () => {
    const user = userEvent.setup();
    const member = { id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue([member]),
    };
    const newerTariff = { ...BUNDLED_TARIFF, id: "newer", version: 2, effective_from: "2026-01-01" };
    const { rerender } = render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText("Admin total bill"), "30");
    await user.click(screen.getByRole("button", { name: "Calculate split" }));
    expect(screen.getByRole("region", { name: "Calculated split" })).toBeInTheDocument();

    rerender(<Admin configured database={database} tariffs={[newerTariff, BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);

    expect(screen.queryByRole("region", { name: "Calculated split" })).not.toBeInTheDocument();
  });

  it("blocks direct publication of a draft whose roster is stale", async () => {
    const members = [
      { id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true },
      { id: "member-2", display_name: "Debasis", public_alias: "D.", is_active: true },
    ];
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([{
        id: "bill-1",
        status: "draft",
        bill_year: 2026,
        bill_month: 1,
        total_bill: 30,
        people_snapshot: [{ member_id: "member-1", display_name: "Anik", public_alias: "A.", ac_units: 0 }],
      }]),
      members: vi.fn().mockResolvedValue(members),
      setBillStatus: vi.fn(),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText(/roster changed/i)).toBeInTheDocument();
    expect(database.setBillStatus).not.toHaveBeenCalled();
  });

  it("publishes a calculated split after saving its draft snapshot", async () => {
    const user = userEvent.setup();
    const members = [{ id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true }];
    const saved = { id: "bill-1", status: "draft", bill_year: 2026, bill_month: 1 };
    const published = { ...saved, status: "published" };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue(members),
      saveDraft: vi.fn().mockResolvedValue(saved),
      setBillStatus: vi.fn().mockResolvedValue(published),
    };
    const onBillsChanged = vi.fn().mockResolvedValue(undefined);

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} onBillsChanged={onBillsChanged} />);
    await user.type(await screen.findByLabelText("Admin total bill"), "30");
    await user.click(screen.getByRole("button", { name: "Calculate split" }));
    await user.click(screen.getByRole("button", { name: "Publish calculated bill" }));

    expect(database.saveDraft).toHaveBeenCalledOnce();
    expect(database.setBillStatus).toHaveBeenCalledWith("bill-1", "published");
    expect(onBillsChanged).toHaveBeenCalledOnce();
  });

  it("keeps a newly saved draft recoverable when publishing fails", async () => {
    const user = userEvent.setup();
    const members = [{ id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true }];
    const saved = { id: "bill-1", status: "draft", bill_year: 2026, bill_month: 9 };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([]),
      members: vi.fn().mockResolvedValue(members),
      saveDraft: vi.fn().mockResolvedValue(saved),
      setBillStatus: vi.fn().mockRejectedValue(new Error("Publish failed")),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText("Admin total bill"), "30");
    await user.click(screen.getByRole("button", { name: "Calculate split" }));
    await user.click(screen.getByRole("button", { name: "Publish calculated bill" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Publish failed");
    expect(screen.getByRole("button", { name: /2026-09 · draft/i })).toBeInTheDocument();
  });

  it("draws a downloadable image for a published bill", async () => {
    const user = userEvent.setup();
    const published = {
      id: "bill-1",
      bill_year: 2026,
      bill_month: 1,
      total_bill: 30,
      status: "published",
      tariff_snapshot: BUNDLED_TARIFF.slabs,
      calculation_snapshot: { total_units: 4.85, shared_per_person: 0 },
      people_snapshot: [{ position: 0, display_name: "Anik", public_alias: "A.", color: "#e45756", ac_units: 1, ac_amount: 6.18, shared_amount: 23.32, total_amount: 29.5 }],
    };
    const context = {
      scale: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,test");
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([published]),
      members: vi.fn().mockResolvedValue([]),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    const downloadButton = await screen.findByRole("button", { name: "Download January 2026" });
    await user.click(downloadButton);

    expect(screen.getByRole("dialog", { name: "Bill image" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download image" })).toHaveAttribute("download", "electricity-bill-2026-01.png");
    expect(context.fillText).toHaveBeenCalledWith("৳29.50", expect.any(Number), expect.any(Number));
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Bill image" })).not.toBeInTheDocument();
    expect(downloadButton).toHaveFocus();
    getContext.mockRestore();
    toDataURL.mockRestore();
  });

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
      members: vi.fn().mockResolvedValue([{ id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true }]),
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
    expect(screen.getByRole("button", { name: "Calculate split" })).toBeEnabled();
    expect(screen.getByLabelText("Admin total bill")).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Month" })).toContainElement(screen.getByRole("option", { name: "January" }));
    expect(screen.getAllByRole("option")).toHaveLength(13);
    expect(screen.getAllByLabelText("Name")).toHaveLength(1);
    expect(screen.getByLabelText("Public alias for Anik")).toBeDisabled();
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
      members: vi.fn().mockResolvedValue([]),
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
      members: vi.fn().mockResolvedValue([{ id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true }]),
    };

    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} />);
    await screen.findByRole("heading", { name: "Monthly billing admin" });
    await user.clear(screen.getByLabelText("Year"));
    await user.type(screen.getByLabelText("Year"), "2024");

    expect(screen.getByRole("status")).toHaveTextContent("No tariff applies");
    expect(screen.getByRole("button", { name: "Calculate split" })).toBeDisabled();
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
      people_snapshot: [{ member_id: "member-1", display_name: "Anik", public_alias: "A.", ac_units: 0 }],
    };
    const database = {
      session: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
      isAdmin: vi.fn().mockResolvedValue(true),
      drafts: vi.fn().mockResolvedValue([draft]),
      members: vi.fn().mockResolvedValue([{ id: "member-1", display_name: "Anik", public_alias: "A.", is_active: true }]),
      setBillStatus: vi.fn().mockResolvedValue({ ...draft, status: "published" }),
    };
    const onBillsChanged = vi.fn().mockResolvedValue(undefined);
    render(<Admin configured database={database} tariffs={[BUNDLED_TARIFF]} onTariffCreated={vi.fn()} onBillsChanged={onBillsChanged} />);

    await user.click(await screen.findByRole("button", { name: "Publish" }));

    expect(onBillsChanged).toHaveBeenCalledOnce();
  });
});
