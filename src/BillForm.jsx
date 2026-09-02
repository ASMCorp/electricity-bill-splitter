import { useEffect, useRef, useState } from "react";
import { formatMoney, numberFrom, SLABS, splitBill } from "./billMath.js";
import { activeSlabs, createReceipt, formatUnits, initials } from "./receiptImage.js";

const PERSON_COLORS = [
  "#e45756",
  "#3a86ff",
  "#2a9d8f",
  "#f4a261",
  "#7c5cff",
  "#d65db1",
  "#4f7cac",
  "#e76f51",
];

const INITIAL_PEOPLE = ["Anik", "Debasis", "Fuad", "Alamgir"].map((name, index) => ({
  id: index + 1,
  name,
  ac: "",
  color: PERSON_COLORS[index],
}));

function Avatar({ person }) {
  return (
    <span
      className="avatar"
      style={{ "--person-color": person.color }}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  );
}

function TariffBreakdown({ result }) {
  const slabs = activeSlabs(result);

  return (
    <section className="tariff-card" aria-labelledby="tariff-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">How the bill climbs</span>
          <h3 id="tariff-title">Tariff breakdown</h3>
        </div>
        <div className="tariff-total">
          <strong>{formatUnits(result.totalUnits)}</strong>
          <span>units</span>
        </div>
      </div>

      <div className="slab-stack" aria-label="Bill amount divided across tariff slabs">
        {slabs.map((slab) => (
          <div
            className="stack-segment"
            key={slab.index}
            style={{
              "--slab-color": slab.color,
              width: `${Math.max((slab.cost / result.bill) * 100, 4)}%`,
            }}
            title={`Slab ${slab.index + 1}: ৳${formatMoney(slab.cost)}`}
          >
            <span>৳{slab.rate.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="chart-legend" aria-label="Usage legend">
        <span><i className="legend-shared" />Shared</span>
        <span><i className="legend-ac" />AC</span>
      </div>

      <div className="slab-list">
        {slabs.map((slab) => {
          const sharedWidth = slab.used > 0 ? (slab.sharedUnits / slab.used) * 100 : 0;
          const acWidth = slab.used > 0 ? (slab.acUnits / slab.used) * 100 : 0;
          return (
            <div
              className="slab-row"
              data-testid="tariff-slab"
              key={slab.index}
              style={{ "--slab-color": slab.color }}
            >
              <div className="slab-name">
                <i />
                <div>
                  <strong>Slab {slab.index + 1}</strong>
                  <span>৳{slab.rate.toFixed(2)} / unit</span>
                </div>
              </div>
              <div className="slab-visual">
                <div className="slab-meter" aria-hidden="true">
                  <span className="slab-fill shared-use" style={{ width: `${sharedWidth}%` }} />
                  <span className="slab-fill ac-use" style={{ width: `${acWidth}%` }} />
                </div>
                <div className="slab-values">
                  <span>{formatUnits(slab.used)} units</span>
                  <strong>৳{formatMoney(slab.cost)}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function BillForm({ slabs = SLABS, tariffLabel = "Bundled default pricing", tariffLoading = false }) {
  const [bill, setBill] = useState("");
  const [people, setPeople] = useState(INITIAL_PEOPLE);
  const [result, setResult] = useState(null);
  const [activePanel, setActivePanel] = useState("form");
  const [focusRequest, setFocusRequest] = useState({ panel: "form", id: 0 });
  const [error, setError] = useState("");
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    if (focusRequest.panel === "result" && result) resultRef.current?.focus();
    if (focusRequest.panel === "form") formRef.current?.focus();
  }, [focusRequest, result]);

  const focusPanel = (panel) => {
    setActivePanel(panel);
    setFocusRequest((current) => ({ panel, id: current.id + 1 }));
  };

  const updatePerson = (id, key, value) => {
    setPeople((current) => current.map((person) => (
      person.id === id ? { ...person, [key]: value } : person
    )));
    setActivePanel("form");
    setError("");
  };

  const addPerson = () => {
    setPeople((current) => {
      const id = Math.max(0, ...current.map((person) => person.id)) + 1;
      return [
        ...current,
        {
          id,
          name: "",
          ac: "",
          color: PERSON_COLORS[(id - 1) % PERSON_COLORS.length],
        },
      ];
    });
    setActivePanel("form");
  };

  const removePerson = (id) => {
    setPeople((current) => (
      current.length > 1 ? current.filter((person) => person.id !== id) : current
    ));
    setActivePanel("form");
  };

  const calculate = () => {
    if (numberFrom(bill) <= 0) {
      setError("Enter the total bill amount.");
      focusPanel("form");
      return;
    }
    setResult({ ...splitBill(bill, people, slabs), tariffLabel });
    setImage(null);
    setError("");
    focusPanel("result");
  };

  const regenerate = () => {
    focusPanel("form");
  };

  const reset = () => {
    setBill("");
    setPeople((current) => current.map((person) => ({ ...person, ac: "" })));
    setResult(null);
    setImage(null);
    setError("");
    focusPanel("form");
  };

  const saveImage = async () => {
    if (!result) return;
    setBusy(true);
    try {
      setImage(await createReceipt(result));
    } catch {
      setImage("error");
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (event) => {
    if (event.key === "Enter") calculate();
  };

  const workspaceClass = [
    "workspace",
    result ? "has-result" : "",
    result ? `${activePanel}-focus` : "form-focus",
  ].filter(Boolean).join(" ");

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="page-heading">
        <span className="brand-mark">EB</span>
        <div>
          <p>Monthly electricity</p>
          <h1>Split the bill</h1>
        </div>
      </header>

      <main className={workspaceClass}>
        <section
          className="panel input-panel"
          role="region"
          aria-label="Bill inputs"
          tabIndex="-1"
          ref={formRef}
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Step 1</span>
              <h2>Monthly readings</h2>
            </div>
            {result && <span className="edit-state">Editing</span>}
          </div>

          <p className="pricing-label">{tariffLabel}</p>

          <label className="bill-field">
            <span>Total bill</span>
            <div className="bill-input">
              <span>৳</span>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={bill}
                onChange={(event) => {
                  setBill(event.target.value);
                  setActivePanel("form");
                  setError("");
                }}
                onFocus={() => setActivePanel("form")}
                onKeyDown={onEnter}
                aria-label="Total bill in taka"
              />
            </div>
          </label>

          <div className="people-heading">
            <span>People</span>
            <span>Total AC units</span>
          </div>

          <div className="people-list">
            {people.map((person) => (
              <div className="person-row" data-person-id={person.id} key={person.id}>
                <Avatar person={person} />
                <input
                  className="name-input"
                  value={person.name}
                  placeholder="Name"
                  onChange={(event) => updatePerson(person.id, "name", event.target.value)}
                  onFocus={() => setActivePanel("form")}
                  onKeyDown={onEnter}
                  aria-label="Name"
                />
                <div className="unit-input">
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={person.ac}
                    onChange={(event) => updatePerson(person.id, "ac", event.target.value)}
                    onFocus={() => setActivePanel("form")}
                    onKeyDown={onEnter}
                    aria-label={`AC units for ${person.name || "this person"}`}
                  />
                  <span>units</span>
                </div>
                <button
                  className="remove-button"
                  type="button"
                  onClick={() => removePerson(person.id)}
                  aria-label={`Remove ${person.name || "person"}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="form-actions">
            <button className="text-button" type="button" onClick={addPerson}>+ Add person</button>
            <button className="secondary-button" type="button" onClick={reset}>Reset</button>
            <button className="primary-button" type="button" onClick={calculate} disabled={tariffLoading}>{tariffLoading ? "Loading pricing…" : "Calculate bill"}</button>
          </div>
        </section>

        {result && (
          <section
            className="panel result-panel"
            role="region"
            aria-label="Bill result"
            tabIndex="-1"
            ref={resultRef}
          >
            <div className="result-heading">
              <div>
                <span className="eyebrow">Your split</span>
                <h2>Who pays what</h2>
              </div>
              <button className="secondary-button regenerate" type="button" onClick={regenerate}>
                Regenerate
              </button>
            </div>

            {result.capped && (
              <p className="warning" role="status">
                AC readings exceeded the available units, so they were scaled proportionally.
              </p>
            )}

            <div className="summary-strip">
              <div>
                <span>Total bill</span>
                <strong>৳{formatMoney(result.bill)}</strong>
              </div>
              <div>
                <span>Total units</span>
                <strong>{formatUnits(result.totalUnits)}</strong>
              </div>
              <div>
                <span>AC cost</span>
                <strong>৳{formatMoney(result.acCost)}</strong>
              </div>
            </div>

            <div className="person-results">
              {result.rows.map((person) => {
                const maxTotal = Math.max(...result.rows.map((row) => row.total), 1);
                return (
                  <article
                    className="person-share"
                    data-result-person-id={person.id}
                    key={person.id}
                    style={{ "--person-color": person.color }}
                  >
                    <div className="person-share-top">
                      <Avatar person={person} />
                      <div className="person-identity">
                        <h3>{person.name}</h3>
                        <span>{formatUnits(person.u)} AC units</span>
                      </div>
                      <strong>৳{formatMoney(person.total)}</strong>
                    </div>
                    <div className="person-meter" aria-hidden="true">
                      <span style={{ width: `${(person.total / maxTotal) * 100}%` }} />
                    </div>
                    <div className="person-details">
                      <span>Shared ৳{formatMoney(person.shared)}</span>
                      <span>AC ৳{formatMoney(person.ac)}</span>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="composition-card">
              <div className="section-heading compact">
                <div>
                  <span className="eyebrow">Bill composition</span>
                  <h3>Shared vs AC</h3>
                </div>
              </div>
              <div className="composition-bar" aria-label="Shared and AC portions of the bill">
                <span
                  className="composition-shared"
                  style={{ width: `${result.bill > 0 ? ((result.bill - result.acCost) / result.bill) * 100 : 0}%` }}
                />
                <span
                  className="composition-ac"
                  style={{ width: `${result.bill > 0 ? (result.acCost / result.bill) * 100 : 0}%` }}
                />
              </div>
              <div className="composition-values">
                <span><i className="legend-shared" />Shared <strong>৳{formatMoney(result.bill - result.acCost)}</strong></span>
                <span><i className="legend-ac" />AC <strong>৳{formatMoney(result.acCost)}</strong></span>
              </div>
            </div>

            <TariffBreakdown result={result} />
            <p className="pricing-label">{result.tariffLabel}</p>

            <div className="result-footer">
              <span className="balanced-mark">✓ Balanced to ৳{formatMoney(result.bill)}</span>
              <div>
                <button className="secondary-button" type="button" onClick={saveImage} disabled={busy}>
                  {busy ? "Drawing…" : "Save image"}
                </button>

              </div>
            </div>
          </section>
        )}
      </main>

      {image && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Bill image">
          <div className="sheet-inner">
            {image === "error" ? (
              <p className="form-error">Could not draw the image. Please try again.</p>
            ) : (
              <>
                <img src={image} alt="Electricity bill summary" />
                <a className="primary-button download" href={image} download="electricity-bill.png">
                  Download image
                </a>
              </>
            )}
            <button className="secondary-button" type="button" onClick={() => setImage(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&display=swap');

.app {
  --page: #eef1f1;
  --surface: #ffffff;
  --ink: #14262c;
  --muted: #667a80;
  --line: #dce3e5;
  --soft: #f5f7f7;
  --accent: #0b7a75;
  --accent-dark: #075d59;
  --shared: #f0b45f;
  --ac: #167f89;
  min-height: 100vh;
  padding: 28px clamp(16px, 3vw, 44px) 64px;
  background:
    radial-gradient(circle at 90% 0%, rgba(11, 122, 117, 0.09), transparent 28rem),
    var(--page);
  color: var(--ink);
  font-family: 'Familjen Grotesk', ui-sans-serif, system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}

.app * { box-sizing: border-box; }
.app button, .app input { font: inherit; }
.app button { -webkit-tap-highlight-color: transparent; }
.app :focus-visible { outline: 3px solid rgba(11, 122, 117, 0.28); outline-offset: 3px; }

.page-heading {
  width: min(100%, 1240px);
  margin: 0 auto 22px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.page-heading p { margin: 0; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; }
.page-heading h1 { margin: 0; font-size: clamp(25px, 3vw, 34px); line-height: 1; letter-spacing: -0.035em; }

.workspace {
  width: min(100%, 660px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  transition: width 360ms ease, grid-template-columns 360ms ease;
}
.workspace.has-result { width: min(100%, 1240px); }
.workspace.has-result.result-focus { grid-template-columns: minmax(290px, 340px) minmax(0, 1fr); }
.workspace.has-result.form-focus { grid-template-columns: minmax(0, 1fr) minmax(360px, 440px); }

.panel {
  min-width: 0;
  border: 1px solid rgba(20, 38, 44, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 50px rgba(20, 38, 44, 0.08);
  transition: box-shadow 220ms ease, transform 220ms ease, opacity 220ms ease;
}
.panel:focus { outline: none; }
.input-panel { padding: clamp(20px, 3vw, 28px); position: sticky; top: 20px; }
.result-panel { padding: clamp(20px, 3vw, 30px); }
.result-focus .input-panel { opacity: 0.86; box-shadow: 0 10px 24px rgba(20, 38, 44, 0.05); }
.form-focus .result-panel { opacity: 0.78; box-shadow: 0 10px 24px rgba(20, 38, 44, 0.05); }
.result-panel:focus, .input-panel:focus { opacity: 1; box-shadow: 0 22px 60px rgba(20, 38, 44, 0.12); }

.panel-heading, .result-heading, .section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.panel-heading h2, .result-heading h2, .section-heading h3 { margin: 2px 0 0; letter-spacing: -0.025em; line-height: 1.05; }
.panel-heading h2, .result-heading h2 { font-size: clamp(22px, 3vw, 29px); }
.section-heading h3 { font-size: 20px; }
.eyebrow { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
.edit-state { padding: 5px 9px; border-radius: 999px; background: #e7f3f1; color: var(--accent-dark); font-size: 11px; font-weight: 700; }

.bill-field { display: block; margin-top: 26px; }
.bill-field > span, .people-heading { color: var(--muted); font-size: 12px; font-weight: 600; }
.bill-input {
  margin-top: 6px;
  padding: 3px 0 8px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  border-bottom: 2px solid var(--ink);
}
.bill-input > span { color: var(--muted); font-size: 28px; }
.bill-input input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font-size: clamp(36px, 6vw, 52px);
  font-weight: 700;
  letter-spacing: -0.045em;
}
.bill-input input::placeholder { color: #c8d0d2; }

.people-heading { margin: 28px 38px 8px 50px; display: flex; justify-content: space-between; }
.people-list { display: grid; gap: 8px; }
.person-row {
  display: grid;
  grid-template-columns: 38px minmax(80px, 1fr) minmax(105px, 0.8fr) 24px;
  align-items: center;
  gap: 9px;
  padding: 7px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--surface);
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  background: var(--person-color);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.name-input, .unit-input input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
}
.name-input { font-weight: 600; }
.unit-input { display: flex; align-items: baseline; justify-content: flex-end; gap: 5px; }
.unit-input input { text-align: right; font-weight: 700; }
.unit-input span { color: var(--muted); font-size: 11px; }
.remove-button {
  border: 0;
  background: transparent;
  color: #99a7aa;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}
.remove-button:hover { color: #b44b52; }

.form-error, .warning { margin: 14px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 12px; }
.form-error { background: #fff0ef; color: #a13c43; }
.warning { background: #fff4e5; color: #8d5b19; }
.form-actions { margin-top: 20px; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.text-button, .secondary-button, .primary-button {
  min-height: 38px;
  border-radius: 10px;
  padding: 9px 13px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.text-button { border: 0; padding-left: 0; background: transparent; color: var(--accent-dark); }
.secondary-button { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
.secondary-button:hover { border-color: #a9b7ba; }
.primary-button { margin-left: auto; border: 1px solid var(--ink); background: var(--ink); color: #fff; }
.primary-button:hover { background: var(--accent-dark); border-color: var(--accent-dark); }
.secondary-button:disabled { opacity: 0.5; cursor: default; }

.result-heading { align-items: center; }
.regenerate { white-space: nowrap; }
.summary-strip {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: var(--soft);
}
.summary-strip > div { padding: 14px 16px; border-right: 1px solid var(--line); }
.summary-strip > div:last-child { border-right: 0; }
.summary-strip span { display: block; color: var(--muted); font-size: 11px; }
.summary-strip strong { display: block; margin-top: 2px; font-size: clamp(17px, 2.2vw, 23px); letter-spacing: -0.025em; }

.person-results { margin-top: 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.person-share {
  position: relative;
  overflow: hidden;
  padding: 14px;
  border: 1px solid var(--line);
  border-top: 4px solid var(--person-color);
  border-radius: 14px;
  background: var(--surface);
}
.person-share-top { display: flex; align-items: center; gap: 10px; }
.person-identity { min-width: 0; flex: 1; }
.person-identity h3 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
.person-identity span { display: block; color: var(--muted); font-size: 11px; }
.person-share-top > strong { color: var(--person-color); font-size: clamp(17px, 2vw, 21px); letter-spacing: -0.025em; }
.person-meter { height: 5px; margin-top: 12px; overflow: hidden; border-radius: 99px; background: #edf1f1; }
.person-meter span { display: block; height: 100%; border-radius: inherit; background: var(--person-color); }
.person-details { margin-top: 7px; display: flex; justify-content: space-between; color: var(--muted); font-size: 10.5px; }

.composition-card, .tariff-card { margin-top: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.composition-card { padding: 16px; }
.section-heading.compact h3 { font-size: 17px; }
.composition-bar { height: 16px; margin-top: 14px; display: flex; overflow: hidden; border-radius: 999px; background: #edf1f1; }
.composition-shared { background: var(--shared); }
.composition-ac { background: var(--ac); }
.composition-values { margin-top: 9px; display: flex; justify-content: space-between; gap: 14px; color: var(--muted); font-size: 11px; }
.composition-values span { display: flex; align-items: center; gap: 5px; }
.composition-values strong { color: var(--ink); }
.legend-shared, .legend-ac { width: 9px; height: 9px; display: inline-block; border-radius: 3px; }
.legend-shared { background: var(--shared); }
.legend-ac { background: var(--ac); }

.tariff-card { padding: 18px; }
.tariff-total { text-align: right; }
.tariff-total strong { display: block; font-size: 23px; line-height: 1; }
.tariff-total span { color: var(--muted); font-size: 10px; }
.slab-stack { height: 48px; margin-top: 16px; display: flex; overflow: hidden; border-radius: 11px; background: #edf1f1; }
.stack-segment {
  min-width: 32px;
  display: grid;
  place-items: center;
  background: var(--slab-color);
  border-right: 2px solid rgba(255, 255, 255, 0.65);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.stack-segment:last-child { border-right: 0; }
.chart-legend { margin: 9px 0 14px; display: flex; justify-content: flex-end; gap: 14px; color: var(--muted); font-size: 10px; }
.chart-legend span { display: flex; align-items: center; gap: 5px; }
.slab-list { display: grid; gap: 7px; }
.slab-row {
  display: grid;
  grid-template-columns: minmax(116px, 0.75fr) minmax(160px, 1.5fr);
  align-items: center;
  gap: 14px;
  padding: 9px 0;
  border-top: 1px solid #edf1f1;
}
.slab-name { display: flex; align-items: center; gap: 9px; }
.slab-name > i { width: 10px; height: 34px; flex: 0 0 auto; border-radius: 4px; background: var(--slab-color); }
.slab-name strong, .slab-name span { display: block; }
.slab-name strong { font-size: 12px; }
.slab-name span { color: var(--muted); font-size: 10px; }
.slab-meter { height: 10px; display: flex; overflow: hidden; border-radius: 99px; background: #edf1f1; }
.slab-fill { height: 100%; background-color: var(--slab-color); }
.slab-fill.shared-use { opacity: 0.45; }
.slab-fill.ac-use {
  opacity: 1;
  background-image: repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.4) 4px 7px);
}
.slab-values { margin-top: 5px; display: flex; justify-content: space-between; color: var(--muted); font-size: 10.5px; }
.slab-values strong { color: var(--ink); }

.result-footer { margin-top: 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.result-footer > div { display: flex; gap: 8px; }
.balanced-mark { color: var(--accent-dark); font-size: 11px; font-weight: 600; }

.sheet { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 20px; background: rgba(20, 38, 44, 0.62); }
.sheet-inner { width: min(100%, 620px); max-height: 90vh; overflow: auto; padding: 16px; border-radius: 18px; background: #fff; }
.sheet-inner img { width: 100%; height: auto; display: block; border: 1px solid var(--line); border-radius: 12px; }
.sheet-inner .secondary-button { margin-top: 12px; }
.download { display: inline-block; margin: 12px 8px 0 0; text-decoration: none; }

@media (max-width: 900px) {
  .workspace.has-result.result-focus, .workspace.has-result.form-focus { grid-template-columns: 1fr; }
  .workspace.has-result.result-focus .result-panel { order: 1; }
  .workspace.has-result.result-focus .input-panel { order: 2; }
  .workspace.has-result.form-focus .input-panel { order: 1; }
  .workspace.has-result.form-focus .result-panel { order: 2; }
  .input-panel { position: static; }
}

@media (max-width: 560px) {
  .app { padding: 18px 12px 44px; }
  .page-heading { margin-bottom: 15px; }
  .panel { border-radius: 17px; }
  .person-row { grid-template-columns: 34px minmax(70px, 1fr) minmax(92px, 0.9fr) 20px; gap: 6px; padding: 6px; }
  .people-heading { margin-left: 46px; margin-right: 28px; }
  .form-actions { align-items: stretch; }
  .text-button { width: 100%; text-align: left; }
  .primary-button { flex: 1; }
  .summary-strip { grid-template-columns: 1fr 1fr; }
  .summary-strip > div { border-bottom: 1px solid var(--line); }
  .summary-strip > div:nth-child(2) { border-right: 0; }
  .summary-strip > div:last-child { grid-column: 1 / -1; border-bottom: 0; }
  .person-results { grid-template-columns: 1fr; }
  .slab-row { grid-template-columns: 1fr; gap: 7px; }
  .slab-name > i { width: 30px; height: 8px; }
  .result-footer { align-items: flex-start; flex-direction: column; }
}

`;
