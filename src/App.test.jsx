import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("application views", () => {
  it("navigates public views and explains unconfigured database features", async () => {
    const user = userEvent.setup();
    render(<App configured={false} />);

    expect(screen.getByRole("heading", { name: "Split the bill" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save pdf/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Transparency" }));
    expect(screen.getByRole("heading", { name: "How every taka is calculated" })).toBeInTheDocument();
    expect(screen.getByText("৳6.18 / unit")).toBeInTheDocument();
    expect(screen.getByText(/bundled default/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pricing version history" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Monthly Bills" }));
    expect(screen.getByText(/supabase setup is required/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.getByText(/configure supabase/i)).toBeInTheDocument();
  });

  it("waits for configured tariff loading before enabling calculation", async () => {
    const tariffs = deferred();
    const databaseClient = {
      tariffVersions: vi.fn(() => tariffs.promise),
      publishedBills: vi.fn().mockResolvedValue([]),
    };
    render(<App configured databaseClient={databaseClient} />);

    expect(screen.getByRole("button", { name: "Loading pricing…" })).toBeDisabled();

    tariffs.resolve([]);
    expect(await screen.findByRole("button", { name: "Calculate bill" })).toBeEnabled();
  });

  it("explicitly labels bundled fallback pricing after a database load failure", async () => {
    const user = userEvent.setup();
    const databaseClient = {
      tariffVersions: vi.fn().mockRejectedValue(new Error("offline")),
      publishedBills: vi.fn().mockResolvedValue([]),
    };
    render(<App configured databaseClient={databaseClient} />);

    expect(await screen.findByText(/bundled fallback pricing · database unavailable/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Transparency" }));
    expect(screen.getByText(/bundled default tariff because database pricing could not be loaded/i)).toBeInTheDocument();
  });
});
