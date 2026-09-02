import { useEffect, useMemo, useState } from "react";
import BillForm from "./BillForm.jsx";
import Admin from "./components/Admin.jsx";
import MonthlyBills from "./components/MonthlyBills.jsx";
import Transparency from "./components/Transparency.jsx";
import { BUNDLED_TARIFF, currentTariff } from "./tariffs.js";
import { database, isSupabaseConfigured } from "./supabase.js";

const views = ["Calculator", "Transparency", "Monthly Bills", "Admin"];

export default function App({ configured = isSupabaseConfigured, databaseClient = database }) {
  const [view, setView] = useState("Calculator");
  const [tariffs, setTariffs] = useState([BUNDLED_TARIFF]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(configured);
  const [databaseError, setDatabaseError] = useState("");

  useEffect(() => {
    if (!configured) return;
    Promise.all([databaseClient.tariffVersions(), databaseClient.publishedBills()])
      .then(([versions, published]) => {
        if (versions.length) setTariffs(versions);
        setBills(published);
      })
      .catch((error) => setDatabaseError(`Could not load database records: ${error.message}`))
      .finally(() => setLoading(false));
  }, [configured, databaseClient]);

  const activeTariff = useMemo(() => currentTariff(tariffs), [tariffs]);
  const addTariff = async (created) => setTariffs((current) => [created, ...current].sort((a, b) => b.effective_from.localeCompare(a.effective_from)));
  const refreshPublishedBills = async () => {
    const published = await databaseClient.publishedBills();
    setBills(published);
  };
  const usingBundledReason = !configured ? "not-configured" : databaseError ? "load-failed" : "";
  const calculatorLabel = databaseError
    ? "Bundled fallback pricing · database unavailable"
    : `Pricing v${activeTariff.version} · effective ${activeTariff.effective_from}`;

  return (
    <div className="site-shell">
      <header className="site-header">
        <button className="site-brand" type="button" onClick={() => setView("Calculator")}><span>EB</span><strong>Electricity Split</strong></button>
        <nav aria-label="Primary navigation">{views.map((item) => <button className={view === item ? "active" : ""} type="button" key={item} onClick={() => setView(item)}>{item}</button>)}</nav>
      </header>
      {view === "Calculator" && <BillForm slabs={activeTariff.slabs} tariffLabel={calculatorLabel} tariffLoading={configured && loading} />}
      {view === "Transparency" && <Transparency tariffs={tariffs} usingBundledReason={usingBundledReason} />}
      {view === "Monthly Bills" && <MonthlyBills bills={bills} configured={configured} loading={loading} error={databaseError} />}
      {view === "Admin" && <Admin configured={configured} database={databaseClient} tariffs={tariffs} onTariffCreated={addTariff} onBillsChanged={refreshPublishedBills} />}
    </div>
  );
}
