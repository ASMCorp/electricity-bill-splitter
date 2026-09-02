import { useState } from "react";
import { formatMoney } from "../billMath.js";

const monthName = (month) => new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2026, month - 1));

export default function MonthlyBills({ bills, configured, loading, error }) {
  const [selected, setSelected] = useState(null);
  if (!configured) return <main className="content-page empty-state"><h1>Monthly Bills</h1><p>Supabase setup is required to load published monthly records. No local or fake records are shown.</p></main>;
  if (loading) return <main className="content-page empty-state"><h1>Monthly Bills</h1><p>Loading published bills…</p></main>;
  if (error) return <main className="content-page empty-state"><h1>Monthly Bills</h1><p role="alert">{error}</p></main>;
  if (!bills.length) return <main className="content-page empty-state"><h1>Monthly Bills</h1><p>No bills have been published yet.</p></main>;

  const detail = selected || bills[0];
  return (
    <main className="content-page">
      <header className="view-heading"><span className="eyebrow">Published ledger</span><h1>Monthly Bills</h1><p>Published records are public and read-only.</p></header>
      <div className="bill-browser">
        <section className="content-card bill-list" aria-label="Published bills">
          {bills.map((bill) => <button type="button" key={bill.id} onClick={() => setSelected(bill)}><span>{monthName(bill.bill_month)} {bill.bill_year}</span><strong>৳{formatMoney(bill.total_bill)}</strong></button>)}
        </section>
        <section className="content-card" aria-label="Monthly bill details">
          <h2>{monthName(detail.bill_month)} {detail.bill_year}</h2>
          <p className="large-total">৳{formatMoney(detail.total_bill)}</p>
          <div className="published-people">
            {detail.people_snapshot.map((person) => (
              <article key={`${person.position}-${person.display_name}`}>
                <strong>{person.display_name}</strong>
                <span>{person.ac_units.toFixed(2)} AC units</span>
                <b>৳{formatMoney(person.total_amount)}</b>
              </article>
            ))}
          </div>
          <p className="privacy-note">Names are stored with each published snapshot.</p>
        </section>
      </div>
    </main>
  );
}
