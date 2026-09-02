import { useEffect, useMemo, useRef, useState } from "react";
import { buildMonthlyBillPayload } from "../monthlyBills.js";
import { formatMoney, numberFrom, splitBill } from "../billMath.js";
import { earliestTariffDateForNewVersion, tariffForBillMonth } from "../tariffs.js";
import { createReceipt } from "../receiptImage.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const RECEIPT_COLORS = ["#e45756", "#3a86ff", "#2a9d8f", "#f4a261", "#7c5cff", "#d65db1", "#4f7cac", "#e76f51"];
const DEFAULT_TARIFF_SLABS = [
  { id: 1, upperLimit: "75", rate: "6.18" },
  { id: 2, upperLimit: "199", rate: "8.50" },
  { id: 3, upperLimit: "298", rate: "9.10" },
  { id: 4, upperLimit: "397", rate: "9.62" },
  { id: 5, upperLimit: "596", rate: "15.01" },
  { id: 6, upperLimit: null, rate: "17.35" },
];
const peopleFromMembers = (members) => members
  .filter((member) => member.is_active)
  .map((member) => ({ id: member.id, name: member.display_name, ac: "" }));

const billMatchesActiveRoster = (bill, members) => {
  const activeMembers = members.filter((member) => member.is_active);
  const snapshot = bill.people_snapshot || [];
  if (snapshot.length !== activeMembers.length) return false;
  return activeMembers.every((member) => snapshot.some((person) => (
    person.member_id === member.id
    && person.display_name === member.display_name
  )));
};

const tariffRanges = (slabs) => {
  let lowerLimit = 0;
  return slabs.map((slab, index) => {
    const upperLimit = slab.units === null ? null : lowerLimit + Number(slab.units);
    const range = upperLimit === null ? `Above ${lowerLimit}` : `${lowerLimit} to ${upperLimit}`;
    lowerLimit = upperLimit ?? lowerLimit;
    return { index, range, rate: Number(slab.rate) };
  });
};

export default function Admin({ configured, database, tariffs, onTariffCreated, onTariffsChanged = async () => {}, onBillsChanged = async () => {} }) {
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
  const [members, setMembers] = useState([]);
  const [memberNames, setMemberNames] = useState({});
  const [newMemberName, setNewMemberName] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [bill, setBill] = useState("");
  const [people, setPeople] = useState([]);
  const [calculatedDraft, setCalculatedDraft] = useState(null);
  const [image, setImage] = useState(null);
  const [drawingId, setDrawingId] = useState(null);
  const [deletingTariffId, setDeletingTariffId] = useState(null);
  const imageDialogRef = useRef(null);
  const imageCloseRef = useRef(null);
  const imageOpenerRef = useRef(null);

  const [tariffEffective, setTariffEffective] = useState("");
  const [tariffLabel, setTariffLabel] = useState("");
  const [tariffSlabs, setTariffSlabs] = useState(DEFAULT_TARIFF_SLABS);

  const requiredTariff = useMemo(() => tariffForBillMonth(tariffs, year, month), [tariffs, year, month]);
  const tariff = requiredTariff;
  const earliestTariffDate = useMemo(() => earliestTariffDateForNewVersion(bills), [bills]);
  const reviewedDraft = calculatedDraft?.tariff_version_id === requiredTariff?.id ? calculatedDraft : null;

  useEffect(() => {
    if (!image) return undefined;
    imageCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setImage(null);
        imageOpenerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [image]);

  const loadAdmin = async (activeSession) => {
    if (!activeSession) return;
    const admin = await database.isAdmin(activeSession.user.id);
    if (!admin) {
      await database.signOut();
      throw new Error("This account is not an authorized administrator.");
    }
    setSession(activeSession);
    setAuthorized(true);
    const [loadedBills, loadedMembers] = await Promise.all([database.drafts(), database.members()]);
    setBills(loadedBills);
    setMembers(loadedMembers);
    setPeople(peopleFromMembers(loadedMembers));
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
      const [loadedBills, loadedMembers] = await Promise.all([database.drafts(), database.members()]);
      if (!live) return;
      setBills(loadedBills);
      setMembers(loadedMembers);
      setPeople(peopleFromMembers(loadedMembers));
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
      if (!reviewedDraft) throw new Error("Calculate the split before saving.");
      const saved = await database.saveDraft(reviewedDraft, editingId);
      setBills((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setEditingId(saved.id); setEditingStatus(saved.status); setMessage("Draft saved with its tariff and calculation snapshots.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const calculate = () => {
    setMessage("");
    try {
      setCalculatedDraft(buildMonthlyBillPayload({ year, month, bill, people, tariff }));
    } catch (error) { setMessage(error.message); }
  };

  const publishCalculated = async () => {
    if (!reviewedDraft) return;
    setBusy(true); setMessage("");
    try {
      const saved = await database.saveDraft(reviewedDraft, editingId);
      setBills((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setEditingId(saved.id);
      setEditingStatus(saved.status);
      const published = await database.setBillStatus(saved.id, "published");
      setBills((current) => [published, ...current.filter((item) => item.id !== published.id)]);
      setEditingId(published.id);
      setEditingStatus("published");
      await onBillsChanged();
      setMessage("Bill published.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const downloadBill = async (item) => {
    imageOpenerRef.current = document.activeElement;
    setDrawingId(item.id); setMessage("");
    try {
      const receiptPeople = (item.people_snapshot || []).map((person, index) => ({
        id: person.position ?? index,
        name: person.display_name,
        ac: person.ac_units,
        color: person.color || RECEIPT_COLORS[index % RECEIPT_COLORS.length],
      }));
      const calculated = splitBill(item.total_bill, receiptPeople, item.tariff_snapshot);
      const result = {
        ...calculated,
        totalUnits: Number(item.calculation_snapshot?.total_units ?? calculated.totalUnits),
        sharedPerPerson: Number(item.calculation_snapshot?.shared_per_person ?? calculated.sharedPerPerson),
        rows: (item.people_snapshot || []).map((person, index) => ({
          id: person.position ?? index,
          name: person.display_name,
          color: person.color || RECEIPT_COLORS[index % RECEIPT_COLORS.length],
          u: Number(person.ac_units),
          ac: Number(person.ac_amount),
          shared: Number(person.shared_amount),
          total: Number(person.total_amount),
        })),
      };
      setImage({
        src: await createReceipt(result),
        filename: `electricity-bill-${item.bill_year}-${String(item.bill_month).padStart(2, "0")}.png`,
      });
    } catch {
      setImage({ error: true });
    } finally { setDrawingId(null); }
  };

  const closeImage = () => {
    setImage(null);
    imageOpenerRef.current?.focus();
  };

  const trapImageFocus = (event) => {
    if (event.key !== "Tab") return;
    const controls = imageDialogRef.current?.querySelectorAll("a[href], button:not([disabled])");
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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


  const newMonthlyBill = () => {
    const today = new Date();
    setEditingId(null);
    setEditingStatus("draft");
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setBill("");
    setPeople(peopleFromMembers(members));
    setCalculatedDraft(null);

    setMessage("");
  };

  const editBill = (item) => {
    setEditingId(item.id);
    setEditingStatus(item.status);
    setYear(item.bill_year);
    setMonth(item.bill_month);
    setBill(String(item.total_bill));
    setCalculatedDraft(null);

    if (item.status === "published") {
      setPeople((item.people_snapshot || []).map((person, index) => ({
        id: person.member_id || index + 1,
        name: person.display_name,
        ac: String(person.ac_units),
      })));
      return;
    }

    const snapshotByMemberId = new Map((item.people_snapshot || []).map((person) => [person.member_id, person]));
    setPeople(peopleFromMembers(members).map((person) => ({
      ...person,
      ac: String(snapshotByMemberId.get(person.id)?.ac_units ?? ""),
    })));
  };

  const createTariff = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      let lowerLimit = 0;
      const slabs = tariffSlabs.map((slab) => {
        const rate = numberFrom(slab.rate);
        if (slab.upperLimit === null) return { units: null, rate };
        const upperLimit = numberFrom(slab.upperLimit);
        const units = upperLimit - lowerLimit;
        lowerLimit = upperLimit;
        return { units, rate };
      });
      if (!tariffEffective || !tariffLabel || slabs.some((slab) => slab.rate <= 0 || (slab.units !== null && slab.units <= 0))) throw new Error("Enter a label, effective date, and valid increasing slab ranges and prices.");
      if (earliestTariffDate && tariffEffective < earliestTariffDate) throw new Error(`New pricing must start on or after ${earliestTariffDate}.`);
      const created = await database.createTariff({ label: tariffLabel, effective_from: tariffEffective, slabs });
      await onTariffCreated(created);
      setCalculatedDraft(null);
      setMessage("Tariff version created.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const addTariffSlab = () => {
    setTariffSlabs((current) => {
      const id = Math.max(...current.map((slab) => slab.id)) + 1;
      return [...current.slice(0, -1), { id, upperLimit: "", rate: "" }, current[current.length - 1]];
    });
  };

  const updateTariffSlab = (id, field, value) => {
    setTariffSlabs((current) => current.map((slab) => slab.id === id ? { ...slab, [field]: value } : slab));
  };

  const removeTariffSlab = (id) => {
    setTariffSlabs((current) => current.filter((slab) => slab.id !== id));
  };

  const deleteTariff = async (tariffToDelete) => {
    setBusy(true); setMessage("");
    try {
      await database.deleteTariff(tariffToDelete.id);
      const remaining = await database.tariffVersions();
      if (remaining.some((item) => item.id === tariffToDelete.id)) throw new Error("The tariff version was not deleted.");
      await onTariffsChanged(remaining);
      setCalculatedDraft(null);
      setDeletingTariffId(null);
      setMessage("Unused future tariff version deleted.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const loadTariffTemplate = (tariffToCopy) => {
    let upperLimit = 0;
    setTariffSlabs(tariffToCopy.slabs.map((slab, index) => {
      if (slab.units === null) return { id: index + 1, upperLimit: null, rate: String(slab.rate) };
      upperLimit += Number(slab.units);
      return { id: index + 1, upperLimit: String(upperLimit), rate: String(slab.rate) };
    }));
    setTariffLabel(`${tariffToCopy.label} copy`);
    setTariffEffective("");
    setMessage(`Version ${tariffToCopy.version} loaded as a new-version template.`);
  };

  const addMember = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const created = await database.createMember({ display_name: newMemberName.trim() });
      setMembers((current) => [...current, created]);
      if (!editingId && created.is_active) {
        setPeople((current) => [...current, { id: created.id, name: created.display_name, ac: "" }]);
      }
      setCalculatedDraft(null);
      setNewMemberName("");

      setMessage("Member added.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const updateMember = async (member, changes) => {
    setBusy(true); setMessage("");
    try {
      const updated = await database.updateMember(member.id, changes);
      setMembers((current) => {
        const next = current.map((item) => item.id === updated.id ? updated : item);
        if (!editingId) setPeople(peopleFromMembers(next));
        return next;
      });
      setMemberNames((current) => {
        const next = { ...current };
        delete next[updated.id];
        return next;
      });

      setCalculatedDraft(null);
      setMessage("display_name" in changes ? "Member updated." : updated.is_active ? "Member restored." : "Member removed from new bills.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  if (!session || !authorized) return (
    <main className="content-page auth-page">
      <form className="content-card auth-card" onSubmit={login}>
        <div className="auth-icon" aria-hidden="true">EB</div>
        <span className="eyebrow">Restricted access</span>
        <h1>Admin login</h1>
        <p className="auth-intro">Sign in to manage monthly bills and tariff versions.</p>
        <div className="form-stack">
          <label>Email address<input aria-label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        </div>
        {message && <p className="form-error" role="alert">{message}</p>}
        <button className="primary-button full-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="auth-footnote">Only approved administrator accounts can continue.</p>
      </form>
    </main>
  );

  return (
    <main className="content-page admin-page">
      <header className="view-heading admin-heading">
        <div><span className="eyebrow">Authorized workspace</span><h1>Monthly billing admin</h1><p>Create, review, and publish monthly electricity records.</p></div>
        <button className="secondary-button action-signout" type="button" onClick={async () => { await database.signOut(); setSession(null); setAuthorized(false); }}>Sign out</button>
      </header>
      {message && <p className="notice" role="status">{message}</p>}
      <div className="admin-grid">
        <form className="content-card admin-form bill-admin-form" onSubmit={save}>
          <div className="panel-heading">
            <div><span className="eyebrow">Bill details</span><h2>{editingId ? (editingStatus === "published" ? "View published bill" : "Edit draft") : "New monthly bill"}</h2></div>
            {editingId && <button className="secondary-button action-new" type="button" onClick={newMonthlyBill}>New monthly bill</button>}
          </div>
          <div className="form-section">
            <div className="field-row"><label>Year<input type="number" value={year} onChange={(e) => { setYear(e.target.value); setCalculatedDraft(null); }} min="2020" required disabled={editingStatus === "published"} /></label><label>Month<select value={month} onChange={(e) => { setMonth(e.target.value); setCalculatedDraft(null); }} required disabled={editingStatus === "published"}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label></div>
            <label>Total bill (৳)<input aria-label="Admin total bill" inputMode="decimal" placeholder="0.00" value={bill} onChange={(e) => { setBill(e.target.value); setCalculatedDraft(null); }} required disabled={editingStatus === "published"} /></label>
            <label>Tariff version<select value={requiredTariff?.id || ""} disabled>{!requiredTariff && <option value="">No applicable tariff</option>}{tariffs.map((item) => <option key={item.id} value={item.id} disabled={item.id !== requiredTariff?.id}>v{item.version} · {item.effective_from}</option>)}</select></label>
          </div>
          {!requiredTariff && <p className="warning" role="status">No tariff applies to this bill month. Create an earlier tariff version first.</p>}
          <div className="people-section">
            <div className="section-title"><div><span className="eyebrow">Residents</span><h3>People and AC usage</h3></div></div>
            <div className="people-labels" aria-hidden="true"><span>Name</span><span>AC units</span></div>
            <div className="admin-people">{people.length ? people.map((person, index) => <div className="person-fields" key={person.id}><span className="person-number" aria-hidden="true">{index + 1}</span><input aria-label="Name" value={person.name} readOnly disabled /><input aria-label={`AC units for ${person.name}`} inputMode="decimal" placeholder="0" value={person.ac} onChange={(e) => { setPeople((list) => list.map((p) => p.id === person.id ? { ...p, ac: e.target.value } : p)); setCalculatedDraft(null); }} disabled={editingStatus === "published"} /></div>) : <p className="empty-list">Create a roster member before calculating a bill.</p>}</div>
          </div>
          {reviewedDraft && <section className="calculated-split" aria-label="Calculated split"><div className="calculated-split-heading"><div><span className="eyebrow">Review</span><h3>Calculated split</h3></div><strong>৳{formatMoney(reviewedDraft.total_bill)}</strong></div><div className="calculated-split-list">{reviewedDraft.people_snapshot.map((person, index) => <article key={person.position}><span className="person-number" aria-hidden="true">{index + 1}</span><div><strong>{person.display_name}</strong><small>{person.ac_units.toFixed(2)} AC units</small></div><span className="calculated-amount">৳{formatMoney(person.total_amount)}</span></article>)}</div><div className="calculated-actions"><button className="primary-button action-publish action-large" type="button" aria-label="Publish calculated bill" onClick={publishCalculated} disabled={busy}>{busy ? "Publishing…" : "Publish bill"}</button></div></section>}
          <div className="form-footer"><span>{editingStatus === "published" ? "Reopen this bill to make changes." : reviewedDraft ? "Review the split, then save it as a private draft." : "Calculate the split before saving this private draft."}</span>{editingStatus === "published" ? <button className="primary-button action-save action-medium" disabled>Save draft</button> : reviewedDraft ? <button className="primary-button action-save action-medium" disabled={busy}>Save draft</button> : <button className="primary-button action-calculate action-large" type="button" onClick={calculate} disabled={busy || !requiredTariff || !people.length}>Calculate split</button>}</div>
        </form>
        <section className="content-card records-card"><span className="eyebrow">History</span><h2>Drafts and published bills</h2><p className="card-intro">Select a record to review or change its publishing status.</p><div className="history-list admin-history">{bills.length ? bills.map((item) => {
          const staleRoster = item.status === "draft" && !billMatchesActiveRoster(item, members);
          return <article key={item.id}><button className="record-button" aria-label={`${item.bill_year}-${String(item.bill_month).padStart(2, "0")} · ${item.status}`} type="button" onClick={() => editBill(item)}><span>{item.bill_year}-{String(item.bill_month).padStart(2, "0")}</span><small className={`status-pill ${item.status}`}>{item.status}</small></button>{staleRoster && <small className="form-error">Roster changed. Open and recalculate this draft.</small>}<div className="record-actions">{item.status === "published" && <button className="secondary-button compact-button action-download" type="button" aria-label={`Download ${MONTHS[item.bill_month - 1]} ${item.bill_year}`} disabled={drawingId === item.id} onClick={() => downloadBill(item)}>{drawingId === item.id ? "Drawing…" : "Download"}</button>}<button className={`secondary-button compact-button ${item.status === "published" ? "action-reopen" : "action-publish"}`} disabled={busy || staleRoster} type="button" onClick={() => changeStatus(item.id, item.status === "published" ? "draft" : "published")}>{item.status === "published" ? "Reopen" : "Publish"}</button></div></article>;
        }) : <p className="empty-list">No saved bills yet.</p>}</div></section>
      </div>
      <section className="content-card members-card">
        <span className="eyebrow">Roster</span>
        <h2>Members</h2>
        <p className="card-intro">Manage the names shown in monthly bills.</p>
        {members.length ? <div className="member-list">{members.map((member) => {
          const displayName = memberNames[member.id] ?? member.display_name;
          return <article key={member.id}><input aria-label={`Member name for ${member.display_name}`} value={displayName} onChange={(event) => setMemberNames((current) => ({ ...current, [member.id]: event.target.value }))} /><span className={`member-status ${member.is_active ? "active" : "removed"}`}>{member.is_active ? "Active" : "Removed"}</span><button className="secondary-button compact-button action-save" type="button" disabled={busy || !displayName.trim()} aria-label={`Save ${member.display_name}`} onClick={() => updateMember(member, { display_name: displayName.trim() })}>Save</button><button className={`secondary-button compact-button ${member.is_active ? "action-remove" : "action-restore"}`} type="button" disabled={busy} aria-label={`${member.is_active ? "Remove" : "Restore"} ${member.display_name}`} onClick={() => updateMember(member, { is_active: !member.is_active })}>{member.is_active ? "Remove" : "Restore"}</button></article>;
        })}</div> : <p className="empty-list">No members yet.</p>}
        <form className="member-add-form" onSubmit={addMember}><label>New member name<input aria-label="New member name" value={newMemberName} onChange={(event) => setNewMemberName(event.target.value)} required /></label><button className="primary-button action-add action-medium" disabled={busy || !newMemberName.trim()}>Add member</button></form>
      </section>
      <form className="content-card tariff-form" onSubmit={createTariff}>
        <div className="panel-heading"><div><span className="eyebrow">Pricing controls</span><h2>Create tariff version</h2><p className="card-intro">Set each unit range and its price. The final slab covers all remaining units.</p></div></div>
        <div className="tariff-fields"><label>Version label<input placeholder="e.g. Residential tariff 2026" value={tariffLabel} onChange={(e) => setTariffLabel(e.target.value)} required /></label><label>Effective date<input type="date" min={earliestTariffDate || undefined} value={tariffEffective} onChange={(e) => setTariffEffective(e.target.value)} required /></label></div>
        <section className="tariff-slab-editor" aria-labelledby="tariff-slabs-title">
          <div className="section-title"><div><span className="eyebrow">Unit pricing</span><h3 id="tariff-slabs-title">Slab ranges</h3></div><button className="secondary-button action-new" type="button" onClick={addTariffSlab}>Add slab</button></div>
          <div className="tariff-slab-labels" aria-hidden="true"><span>Range</span><span>Upper limit</span><span>Price / unit</span><span>Action</span></div>
          <div className="tariff-slab-list">{tariffSlabs.map((slab, index) => {
            const lowerLimit = index === 0 ? 0 : tariffSlabs[index - 1].upperLimit;
            const finalSlab = slab.upperLimit === null;
            return <article className={finalSlab ? "final-slab" : ""} key={slab.id}><div className="slab-range"><strong>Slab {index + 1}</strong><small>{finalSlab ? `Above ${lowerLimit || 0} units` : `${lowerLimit || 0} to ${slab.upperLimit || "…"} units`}</small></div>{finalSlab ? <div className="tariff-final-range"><span>No upper limit</span><small>Final slab</small></div> : <label>Ends at<input aria-label={`Upper limit for slab ${index + 1}`} type="number" min="0.01" step="0.01" value={slab.upperLimit} onChange={(event) => updateTariffSlab(slab.id, "upperLimit", event.target.value)} required /></label>}<label>Price (৳)<input aria-label={`Rate for slab ${index + 1}`} type="number" min="0.01" step="0.01" value={slab.rate} onChange={(event) => updateTariffSlab(slab.id, "rate", event.target.value)} required /></label>{finalSlab ? <span className="slab-required">Required</span> : <button className="secondary-button compact-button action-remove" type="button" aria-label={`Remove slab ${index + 1}`} onClick={() => removeTariffSlab(slab.id)} disabled={tariffSlabs.length <= 2}>Remove</button>}</article>;
          })}</div>
        </section>
        {earliestTariffDate && <p className="privacy-note">To protect saved bills, new pricing must start on or after {earliestTariffDate}.</p>}
        <div className="form-footer"><span>Review every range and price carefully. Versions cannot be edited later.</span><button className="primary-button action-save action-large" disabled={busy}>Create version</button></div>
      </form>
      <section className="content-card tariff-history-card">
        <span className="eyebrow">Pricing records</span>
        <h2>Tariff version history</h2>
        <p className="card-intro">Review saved ranges. Current, past, and bill-linked versions stay protected.</p>
        <div className="tariff-version-list">{tariffs.map((item) => {
          const usedByBill = bills.some((savedBill) => savedBill.tariff_version_id === item.id);
          const canDelete = item.effective_from > now.toISOString().slice(0, 10) && !usedByBill;
          return <article key={item.id}><div className="tariff-version-heading"><div><strong>Version {item.version}: {item.label}</strong><small>Effective {item.effective_from}</small></div><span className={`tariff-protection ${canDelete ? "removable" : "protected"}`}>{canDelete ? "Unused future" : "Protected"}</span></div><div className="tariff-version-slabs">{tariffRanges(item.slabs).map((slab) => <span key={slab.index}><small>{slab.range} units</small><strong>৳{slab.rate.toFixed(2)}</strong></span>)}</div><div className="tariff-version-actions"><button className="secondary-button compact-button action-download" type="button" aria-label={`Copy ${item.label} into new version`} onClick={() => loadTariffTemplate(item)}>Use as template</button>{canDelete && (deletingTariffId === item.id ? <><button className="secondary-button compact-button" type="button" onClick={() => setDeletingTariffId(null)}>Cancel</button><button className="secondary-button compact-button action-remove" type="button" aria-label={`Confirm delete ${item.label}`} disabled={busy} onClick={() => deleteTariff(item)}>Confirm delete</button></> : <button className="secondary-button compact-button action-remove" type="button" aria-label={`Delete ${item.label}`} onClick={() => setDeletingTariffId(item.id)}>Delete</button>)}</div></article>;
        })}</div>
      </section>
      {image && <div ref={imageDialogRef} className="sheet" role="dialog" aria-modal="true" aria-label="Bill image" onKeyDown={trapImageFocus}><div className="sheet-inner">{image.error ? <p className="form-error" role="alert">Could not draw the image. Please try again.</p> : <><img src={image.src} alt="Electricity bill summary" /><a className="primary-button download" href={image.src} download={image.filename}>Download image</a></>}<button ref={imageCloseRef} className="secondary-button" type="button" onClick={closeImage}>Close</button></div></div>}
    </main>
  );
}
