import { useState } from "react";
import { CALCULATION_METHODS, calculationMethodLabel, formatMoney, splitBill } from "../billMath.js";
import { formatUnits } from "../receiptImage.js";
import { currentTariff } from "../tariffs.js";

export default function Transparency({ tariffs, usingBundled, usingBundledReason = usingBundled ? "not-configured" : "" }) {
  const current = currentTariff(tariffs);
  const [method, setMethod] = useState("highest-first");
  const example = splitBill(600, [{ id: 1, name: "Resident A", ac: "20" }, { id: 2, name: "Resident B", ac: "0" }], current.slabs, method);
  const lowestFirst = method === "lowest-first";
  const order = current.slabs.map((_, index) => index);
  if (!lowestFirst) order.reverse();

  return (
    <main className="content-page">
      <header className="view-heading"><span className="eyebrow">Open methodology</span><h1>How every taka is calculated</h1><p>Rates, allocation rules, and the exact pricing version are visible to everyone.</p></header>
      {usingBundledReason === "not-configured" && <p className="notice">Showing the bundled default tariff because Supabase is not configured.</p>}
      {usingBundledReason === "load-failed" && <p className="notice">Showing the bundled default tariff because database pricing could not be loaded.</p>}
      <section className="content-card">
        <h2>Current slab pricing</h2>
        <p><strong>{current.label}</strong> · effective {current.effective_from}</p>
        <div className="price-grid">{current.slabs.map((slab, index) => <article key={index}><span>Slab {index + 1} · {slab.units == null ? "remaining units" : `${slab.units} units`}</span><strong>৳{Number(slab.rate).toFixed(2)} / unit</strong></article>)}</div>
      </section>
      <section className="content-card" aria-labelledby="method-explorer-title">
        <h2 id="method-explorer-title">Explore calculation methods</h2>
        <label className="method-field">Calculation method<select value={method} onChange={(event) => setMethod(event.target.value)}>{Object.entries(CALCULATION_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p className="privacy-note">Compare the same example using each method. This does not change your calculator selection or saved bills.</p>
      </section>
      <div aria-live="polite">
        <section className="content-grid">
          <article className="content-card">
            <h2>Process: {calculationMethodLabel(method)}</h2>
            <ol>
              <li>Estimate total units by consuming the bill amount from the first slab upward. This step is the same for both methods.</li>
              <li>Pool declared AC units. If readings exceed estimated units, scale them proportionally before pricing.</li>
              <li>{lowestFirst ? "Allocate AC from the first, lowest-priced active slab upward." : "Allocate AC from the highest-priced active slab downward."} Move to the next available slab only after using the current slab&apos;s units.</li>
              <li>AC rate = pooled AC cost ÷ allocated AC units (zero if there is no AC).</li>
              <li>Shared per person = (total bill − pooled AC cost) ÷ number of people.</li>
              <li>Person total = shared amount + allocated AC units × pooled AC rate.</li>
            </ol>
          </article>
          <article className="content-card">
            <h2>Worked example</h2>
            <p>Example only: ৳{formatMoney(example.bill)} bill, two residents, Resident A declares 20 AC units and Resident B declares none. Both methods use the current tariff shown above.</p>
            <p>The bill represents {formatUnits(example.totalUnits)} units. {example.capped && "AC readings exceed these units and are scaled proportionally."}</p>
            <ol>{order.filter((index) => example.acPerSlab[index] > 0).map((index) => <li key={index}>Slab {index + 1}: {formatUnits(example.acPerSlab[index])} AC units × ৳{formatMoney(current.slabs[index].rate)} = ৳{formatMoney(example.acPerSlab[index] * current.slabs[index].rate)}</li>)}</ol>
            <p><strong>Pooled AC cost: ৳{formatMoney(example.acCost)}</strong><br />Pooled AC rate: ৳{formatMoney(example.acRate)} / unit<br />Shared cost: ৳{formatMoney(example.bill - example.acCost)}<br />Shared per person: ৳{formatMoney(example.sharedPerPerson)}</p>
          </article>
        </section>
        <section className="content-card" style={{ marginTop: 18 }}>
          <h2>Slab-by-slab breakdown</h2>
          <p>Displayed values are rounded. Calculations use full precision.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", textAlign: "left", borderSpacing: "12px" }}>
              <caption>Example bill units split into AC and shared usage</caption>
              <thead><tr><th scope="col">Slab</th><th scope="col">Rate</th><th scope="col">Bill units</th><th scope="col">AC units</th><th scope="col">AC cost</th><th scope="col">Shared cost</th></tr></thead>
              <tbody>{current.slabs.map((slab, index) => example.perSlab[index] > 0 && <tr key={index}><th scope="row">{index + 1}</th><td>৳{formatMoney(slab.rate)}</td><td>{formatUnits(example.perSlab[index])}</td><td>{formatUnits(example.acPerSlab[index])}</td><td>৳{formatMoney(example.acPerSlab[index] * slab.rate)}</td><td>৳{formatMoney((example.perSlab[index] - example.acPerSlab[index]) * slab.rate)}</td></tr>)}</tbody>
            </table>
          </div>
          <h3>Who pays what</h3>
          <div className="published-people">{example.rows.map((person) => <article key={person.id}><strong>{person.name}</strong><span>Shared ৳{formatMoney(person.shared)} + AC ৳{formatMoney(person.ac)}</span><b>৳{formatMoney(person.total)}</b></article>)}</div>
          <p className="privacy-note">Combined total: ৳{formatMoney(example.rows.reduce((sum, person) => sum + person.total, 0))}. Switching methods changes AC allocation, not the total bill.</p>
        </section>
      </div>
      <section className="content-card" style={{ marginTop: 18 }}>
        <h2>Pricing version history</h2>
        <div className="history-list">{tariffs.map((tariff) => <article key={tariff.id}><strong>Version {tariff.version}: {tariff.label}</strong><span>Effective {tariff.effective_from} · {tariff.slabs.length} slabs</span></article>)}</div>
      </section>
    </main>
  );
}
