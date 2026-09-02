import { formatMoney } from "../billMath.js";
import { currentTariff } from "../tariffs.js";

export default function Transparency({ tariffs, usingBundled, usingBundledReason = usingBundled ? "not-configured" : "" }) {
  const current = currentTariff(tariffs);
  return (
    <main className="content-page">
      <header className="view-heading">
        <span className="eyebrow">Open methodology</span>
        <h1>How every taka is calculated</h1>
        <p>Rates, allocation rules, and the exact pricing version are visible to everyone.</p>
      </header>
      {usingBundledReason === "not-configured" && <p className="notice">Showing the bundled default tariff because Supabase is not configured.</p>}
      {usingBundledReason === "load-failed" && <p className="notice">Showing the bundled default tariff because database pricing could not be loaded.</p>}
      <section className="content-card">
        <h2>Current slab pricing</h2>
        <p><strong>{current.label}</strong> · effective {current.effective_from}</p>
        <div className="price-grid">
          {current.slabs.map((slab, index) => (
            <article key={`${slab.units}-${slab.rate}`}>
              <span>Slab {index + 1} · {slab.units == null ? "remaining units" : `${slab.units} units`}</span>
              <strong>৳{Number(slab.rate).toFixed(2)} / unit</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="content-grid">
        <article className="content-card">
          <h2>Formulas</h2>
          <ol>
            <li>Estimate units by consuming the bill amount from the lowest slab upward.</li>
            <li>Price declared AC units from the highest active slab downward.</li>
            <li>Split the remaining bill equally, then add each person&apos;s AC amount.</li>
            <li>If AC units exceed estimated units, scale AC readings proportionally.</li>
          </ol>
        </article>
        <article className="content-card">
          <h2>Worked explanation</h2>
          <p>For a ৳{formatMoney(600)} bill, the first 75 units cost ৳{formatMoney(75 * 6.18)}. The remainder is converted at the next active rate. AC is then attributed from the most expensive active units so the final person totals reconcile to exactly ৳{formatMoney(600)}.</p>
        </article>
      </section>
      <section className="content-card">
        <h2>Pricing version history</h2>
        <div className="history-list">
          {tariffs.map((tariff) => (
            <article key={tariff.id}>
              <strong>Version {tariff.version}: {tariff.label}</strong>
              <span>Effective {tariff.effective_from} · {tariff.slabs.length} slabs</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
