import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import BillForm from "./BillForm.jsx";

const names = ["Anik", "Debasis", "Fuad", "Alamgir"];

async function enterMonthlyReadings(user) {
  await user.type(screen.getByLabelText("Total bill in taka"), "8625");
  const units = ["60", "54", "106", "0"];
  for (let index = 0; index < names.length; index += 1) {
    await user.type(screen.getByLabelText(`AC units for ${names[index]}`), units[index]);
  }
}

describe("BillForm", () => {
  it("starts with saved names and blank monthly values", () => {
    render(<BillForm />);

    expect(screen.getByLabelText("Total bill in taka")).toHaveValue("");
    names.forEach((name) => expect(screen.getByDisplayValue(name)).toBeInTheDocument());
    names.forEach((name) => expect(screen.getByLabelText(`AC units for ${name}`)).toHaveValue(""));
    expect(screen.getByRole("button", { name: "Calculate bill" })).toBeInTheDocument();
  });

  it("moves focus to a right-side visual result after calculation", async () => {
    const user = userEvent.setup();
    const { container } = render(<BillForm />);
    await enterMonthlyReadings(user);

    await user.click(screen.getByRole("button", { name: "Calculate bill" }));

    const result = screen.getByRole("region", { name: "Bill result" });
    expect(result).toHaveFocus();
    expect(container.querySelector(".workspace")).toHaveClass("has-result");
    expect(within(result).getByText("Tariff breakdown")).toBeInTheDocument();
    expect(within(result).getAllByTestId("tariff-slab").length).toBeGreaterThan(1);
    names.forEach((name) => expect(within(result).getByText(name)).toBeInTheDocument());
    expect(within(result).getByText("60 AC units")).toBeInTheDocument();
  });

  it("keeps direct editing focus on the selected input", async () => {
    const user = userEvent.setup();
    render(<BillForm />);
    await enterMonthlyReadings(user);
    await user.click(screen.getByRole("button", { name: "Calculate bill" }));

    const billInput = screen.getByLabelText("Total bill in taka");
    await user.click(billInput);

    expect(billInput).toHaveFocus();
  });

  it("keeps avatar colors consistent between the form and result", async () => {
    const user = userEvent.setup();
    const { container } = render(<BillForm />);
    await enterMonthlyReadings(user);
    await user.click(screen.getByRole("button", { name: "Calculate bill" }));

    const formAvatar = container.querySelector('[data-person-id="1"] .avatar');
    const resultAvatar = container.querySelector('[data-result-person-id="1"] .avatar');
    expect(formAvatar).toHaveStyle("--person-color: #e45756");
    expect(resultAvatar).toHaveStyle("--person-color: #e45756");
  });

  it("focuses the form for regeneration and clears monthly values on reset", async () => {
    const user = userEvent.setup();
    render(<BillForm />);
    await enterMonthlyReadings(user);
    await user.click(screen.getByRole("button", { name: "Calculate bill" }));

    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    const form = screen.getByRole("region", { name: "Bill inputs" });
    expect(form).toHaveFocus();
    expect(screen.getByRole("region", { name: "Bill result" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(form).toHaveFocus();
    expect(screen.getByLabelText("Total bill in taka")).toHaveValue("");
    names.forEach((name) => expect(screen.getByLabelText(`AC units for ${name}`)).toHaveValue(""));
    expect(screen.queryByRole("region", { name: "Bill result" })).not.toBeInTheDocument();
  });

  it("disables calculation while configured tariff pricing is loading", () => {
    render(<BillForm tariffLoading />);

    expect(screen.getByRole("button", { name: "Loading pricing…" })).toBeDisabled();
  });

  it("keeps the tariff label used by an existing result", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BillForm tariffLabel="Pricing v1" />);
    await enterMonthlyReadings(user);
    await user.click(screen.getByRole("button", { name: "Calculate bill" }));

    rerender(<BillForm tariffLabel="Pricing v2" />);

    const result = screen.getByRole("region", { name: "Bill result" });
    expect(within(result).getByText("Pricing v1")).toBeInTheDocument();
    expect(within(result).queryByText("Pricing v2")).not.toBeInTheDocument();
  });
});
