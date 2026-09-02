import { useEffect, useMemo, useState } from "react";
import { buildMonthlyBillPayload, peopleFromPreviousMonth } from "../monthlyBills.js";
import { numberFrom } from "../billMath.js";
import { earliestTariffDateForNewVersion, tariffForBillMonth } from "../tariffs.js";

const blankPerson = (id) => ({ id, name: "", alias: "", ac: "" });

export default function Admin({ configured, database, tariffs, onTariffCreated, onBillsChanged = async () => {} }) {
  const now = new Date();
  const [session, setSession] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bills, setBills] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingStatus, setEditingStatus] = useState("draft");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [bill, setBill] = useState("");
  const [people, setPeople] = useState([blankPerson(1)]);

  const [tariffEffective, setTariffEffective] = useState("");
  const [tariffLabel, setTariffLabel] = useState("");
  const [tariffSlabs, setTariffSlabs] = useState("75:6.18,124:8.50,99:9.10,99:9.62,199:15.01,*:17.35");

  const requiredTariff = useMemo(() => tariffForBillMonth(tariffs, year, month), [tariffs, year, month]);
  const tariff = requiredTariff;
  const earliestTariffDate = useMemo(() => earliestTariffDateForNewVersion(bills), [bills]);

  const loadAdmin = async (activeSession) => {
    if (!activeSession) return;
    const admin = await database.isAdmin(activeSession.user.id);
    if (!admin) {
      await database.signOut();
      throw new Error("This account is not an authorized administrator.");
    }
    setSession(activeSession);
    setAuthorized(true);
    setBills(await database.drafts());
  };

  useEffect(() => {
    if (!configured) return undefined;
    let live = true;
    database.session().then(async (active) => {
      if (!live || !active) return;
      const admin = await database.isAdmin(active.user.id);
      if (!admin) {
        await database.signOut();
        throw new Error("This account is not an authorized administrator.");
      }
      if (!live) return;
      setSession(active);
      setAuthorized(true);
      setBills(await database.drafts());
    }).catch((error) => live && setMessage(error.message));
    return () => { live = false; };
  }, [configured, database]);

  if (!configured) return <main className="content-page empty-state"><h1>Admin</h1><p>Configure Supabase to enable secure admin login and database persistence.</p></main>;

  const login = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const data = await database.signIn(email, password); await loadAdmin(data.session); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const payload = buildMonthlyBillPayload({ year, month, bill, people, tariff });
      const saved = await database.saveDraft(payload, editingId);
      setBills((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setEditingId(saved.id); setEditingStatus(saved.status); setMessage("Draft saved with its tariff and calculation snapshots.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const changeStatus = async (id, status) => {
    setBusy(true); setMessage("");
    try {
      const updated = await database.setBillStatus(id, status);
      setBills((current) => current.map((item) => item.id === id ? updated : item));
      if (editingId === id) setEditingStatus(updated.status);
      await onBillsChanged();
      setMessage(status === "published" ? "Bill published." : "Bill reopened as a draft.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const loadPrevious = () => {
    const date = new Date(Number(year), Number(month) - 2, 1);
    const previous = bills.find((item) => item.bill_year === date.getFullYear() && item.bill_month === date.getMonth() + 1);
    if (!previous) { setMessage("No previous-month bill was found."); return; }
    setPeople(peopleFromPreviousMonth(previous)); setBill(""); setMessage("People copied; bill and AC values were cleared.");
  };

  const newMonthlyBill = () => {
    const today = new Date();
    setEditingId(null);
    setEditingStatus("draft");
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setBill("");
    setPeople([blankPerson(1)]);

    setMessage("");
  };

  const createTariff = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const slabs = tariffSlabs.split(",").map((entry) => {
        const [units, rate] = entry.trim().split(":");
        return { units: units === "*" ? null : numberFrom(units), rate: numberFrom(rate) };
      });
      if (!tariffEffective || !tariffLabel || slabs.some((slab) => slab.rate <= 0 || slab.units === 0)) throw new Error("Enter a label, effective date, and valid slabs.");
      if (earliestTariffDate && tariffEffective < earliestTariffDate) throw new Error(`New pricing must start on or after ${earliestTariffDate}.`);
      const created = await database.createTariff({ label: tariffLabel, effective_from: tariffEffective, slabs });
      await onTariffCreated(created); setMessage("Tariff version created.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  if (!session || !authorized) return <main className="content-page auth-page"><form className="content-card auth-card" onSubmit={login}><span className="eyebrow">Restricted</span><h1>Admin login</h1><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{message && <p role="alert">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form></main>;

  return (
    <main className="content-page admin-page">
      <header className="view-heading"><span className="eyebrow">Authorized workspace</span><h1>Monthly billing admin</h1><button className="secondary-button" type="button" onClick={async () => { await database.signOut(); setSession(null); setAuthorized(false); }}>Sign out</button></header>
      {message && <p className="notice" role="status">{message}</p>}
      <div className="admin-grid">
        <form className="content-card admin-form" onSubmit={save}>
          <div className="panel-heading">
            <h2>{editingId ? (editingStatus === "published" ? "View published bill" : "Edit draft") : "New monthly bill"}</h2>
            {editingId && <button className="secondary-button" type="button" onClick={newMonthlyBill}>New monthly bill</button>}
          </div>
          <div className="field-row"><label>Year<input type="number" value={year} onChange={(e) => setYear(e.target.value)} min="2020" required disabled={editingStatus === "published"} /></label><label>Month<input type="number" value={month} onChange={(e) => setMonth(e.target.value)} min="1" max="12" required disabled={editingStatus === "published"} /></label></div>
          <label>Total bill<input aria-label="Admin total bill" inputMode="decimal" value={bill} onChange={(e) => setBill(e.target.value)} required disabled={editingStatus === "published"} /></label>
          <label>Tariff version<select value={requiredTariff?.id || ""} disabled>{!requiredTariff && <option value="">No applicable tariff</option>}{tariffs.map((item) => <option key={item.id} value={item.id} disabled={item.id !== requiredTariff?.id}>v{item.version} · {item.effective_from}</option>)}</select></label>
          {!requiredTariff && <p className="warning" role="status">No tariff applies to this bill month. Create an earlier tariff version first.</p>}
          <button className="text-button" type="button" onClick={loadPrevious} disabled={editingStatus === "published"}>Use previous month&apos;s people</button>
          <div className="admin-people">{people.map((person) => <div className="field-row" key={person.id}><input aria-label="Stored display name" placeholder="Stored display name" value={person.name} onChange={(e) => setPeople((list) => list.map((p) => p.id === person.id ? { ...p, name: e.target.value } : p))} required disabled={editingStatus === "published"} /><input aria-label="Public alias" placeholder="Public alias" value={person.alias} onChange={(e) => setPeople((list) => list.map((p) => p.id === person.id ? { ...p, alias: e.target.value } : p))} required disabled={editingStatus === "published"} /><input aria-label={`AC units for ${person.name || "person"}`} placeholder="AC units" value={person.ac} onChange={(e) => setPeople((list) => list.map((p) => p.id === person.id ? { ...p, ac: e.target.value } : p))} disabled={editingStatus === "published"} /></div>)}</div>
          <button className="text-button" type="button" disabled={editingStatus === "published"} onClick={() => setPeople((list) => [...list, blankPerson(Math.max(...list.map((p) => p.id)) + 1)])}>+ Add person</button>
          <button className="primary-button" disabled={busy || editingStatus === "published" || !requiredTariff}>Save draft</button>
        </form>
        <section className="content-card"><h2>Drafts and published bills</h2><div className="history-list">{bills.map((item) => <article key={item.id}><button className="link-button" type="button" onClick={() => { setEditingId(item.id); setEditingStatus(item.status); setYear(item.bill_year); setMonth(item.bill_month); setBill(String(item.total_bill)); setPeople((item.people_snapshot || []).map((p, i) => ({ id: i + 1, name: p.display_name, alias: p.public_alias, ac: String(p.ac_units) }))); }}>{item.bill_year}-{String(item.bill_month).padStart(2, "0")} · {item.status}</button><button className="secondary-button" disabled={busy} type="button" onClick={() => changeStatus(item.id, item.status === "published" ? "draft" : "published")}>{item.status === "published" ? "Reopen" : "Publish"}</button></article>)}</div></section>
      </div>
      <form className="content-card tariff-form" onSubmit={createTariff}><h2>Create tariff version</h2><div className="field-row"><label>Label<input value={tariffLabel} onChange={(e) => setTariffLabel(e.target.value)} required /></label><label>Effective date<input type="date" min={earliestTariffDate || undefined} value={tariffEffective} onChange={(e) => setTariffEffective(e.target.value)} required /></label></div>{earliestTariffDate && <p className="privacy-note">To protect saved bills, new pricing must start on or after {earliestTariffDate}.</p>}<label>Slabs (units:rate, use * for final slab)<input value={tariffSlabs} onChange={(e) => setTariffSlabs(e.target.value)} required /></label><button className="primary-button" disabled={busy}>Create immutable version</button></form>
    </main>
  );
}
