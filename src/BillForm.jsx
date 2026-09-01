import React, { useState } from "react";

/* ------------------------------------------------------------------ */
/* Tariff and maths                                                    */
/* ------------------------------------------------------------------ */

const SLABS = [
  { units: 75, rate: 6.18 },
  { units: 124, rate: 8.5 },
  { units: 99, rate: 9.1 },
  { units: 99, rate: 9.62 },
  { units: 199, rate: 15.01 },
  { units: Infinity, rate: 17.35 },
];

/* How many units a bill amount buys, slab by slab. */
function unitsFromBill(bill) {
  let left = bill;
  const per = SLABS.map(() => 0);
  for (let i = 0; i < SLABS.length && left > 0; i++) {
    const { units, rate } = SLABS[i];
    const capacity = units === Infinity ? Infinity : units * rate;
    if (left >= capacity) {
      per[i] = units;
      left -= capacity;
    } else {
      per[i] = left / rate;
      left = 0;
    }
  }
  return per;
}

/* Air conditioners run on the last units of the month, so peel them off the top. */
function acShare(perSlab, acUnits) {
  let left = acUnits;
  let cost = 0;
  const acPer = SLABS.map(() => 0);
  for (let i = SLABS.length - 1; i >= 0 && left > 0; i--) {
    const take = Math.min(left, perSlab[i]);
    acPer[i] = take;
    cost += take * SLABS[i].rate;
    left -= take;
  }
  return { cost, acPer };
}

const money = (n) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const num = (s) => {
  const v = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

function split(billText, people) {
  const bill = num(billText);
  const perSlab = unitsFromBill(bill);
  const totalUnits = perSlab.reduce((a, b) => a + b, 0);

  const asked = people.reduce((a, p) => a + num(p.ac), 0);
  const acUnits = Math.min(asked, totalUnits);
  const { cost: acCost, acPer } = acShare(perSlab, acUnits);
  const rate = acUnits > 0 ? acCost / acUnits : 0;

  const perHead = people.length ? (bill - acCost) / people.length : 0;

  return {
    bill,
    totalUnits,
    perSlab,
    acPer,
    acUnits,
    acCost,
    rate,
    perHead,
    capped: asked > totalUnits + 1e-9,
    rows: people.map((p) => {
      const u = Math.min(num(p.ac), acUnits);
      return {
        id: p.id,
        name: p.name.trim() || "Unnamed",
        u,
        ac: u * rate,
        shared: perHead,
        total: perHead + u * rate,
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* The column: one month of units, stacked from the cheapest slab up    */
/* ------------------------------------------------------------------ */

const SHARED_FILL = ["#f6e8d3", "#efdabb", "#e8caa0", "#e0ba84", "#d8aa68"];
const AC_FILL = ["#a9d3d8", "#7fbfc6", "#52a8b1", "#238f9a", "#07727d"];

/* The month as a stack of bands, cheapest units at the bottom. */
function bandsOf(r) {
  const bands = [];
  const ticks = [0];
  let floor = 0;

  SLABS.forEach((s, i) => {
    const used = r.perSlab[i];
    if (used <= 0) return;
    const ac = r.acPer[i];
    const shared = used - ac;

    if (shared > 0)
      bands.push({
        key: `s${i}`,
        from: floor,
        to: floor + shared,
        fill: SHARED_FILL[Math.min(i, SHARED_FILL.length - 1)],
        ink: "#12242a",
        rate: s.rate,
        cost: shared * s.rate,
      });

    if (ac > 0)
      bands.push({
        key: `a${i}`,
        from: floor + shared,
        to: floor + used,
        fill: AC_FILL[Math.min(i, AC_FILL.length - 1)],
        ink: i >= 3 ? "#ffffff" : "#12242a",
        rate: s.rate,
        cost: ac * s.rate,
      });

    floor += used;
    ticks.push(floor);
  });

  return { bands, ticks };
}

function Column({ r }) {
  if (!(r.totalUnits > 0)) return null;

  const W = 440;
  const top = 26;
  const bottom = 390;
  const x0 = 96;
  const x1 = 248;
  const xb = 260; // bracket rail
  const scale = (bottom - top) / r.totalUnits;
  const y = (u) => bottom - u * scale;

  const { bands, ticks } = bandsOf(r);

  const yCut = y(r.totalUnits - r.acUnits);
  const hasAc = r.acUnits > 0;
  const shownTicks = ticks.filter(
    (t, i) => i === 0 || i === ticks.length - 1 || y(t) - y(ticks[i + 1] ?? t) > 13
  );

  return (
    <figure className="chart">
      <figcaption>
        The bill bought {money(r.totalUnits)} units. Each slab costs more than
        the one below it, and the {money(r.acUnits)} AC units sit at the top.
      </figcaption>

      <svg viewBox={`0 0 ${W} 420`} role="img" aria-label="Tariff slabs for the month, with the air conditioning units at the top">
        {bands.map((b) => {
          const yTop = y(b.to);
          const h = y(b.from) - yTop;
          return (
            <g key={b.key}>
              <rect x={x0} y={yTop} width={x1 - x0} height={h} fill={b.fill} />
              {h >= 15 && (
                <>
                  <text x={x0 + 8} y={yTop + h / 2 + 4} fill={b.ink} fontSize="12">
                    ৳{b.rate.toFixed(2)}
                  </text>
                  <text
                    x={x1 - 8}
                    y={yTop + h / 2 + 4}
                    fill={b.ink}
                    fontSize="12"
                    textAnchor="end"
                    opacity="0.85"
                  >
                    ৳{money(b.cost)}
                  </text>
                </>
              )}
              <line x1={x0} x2={x1} y1={yTop} y2={yTop} stroke="#ffffff" strokeWidth="1" />
            </g>
          );
        })}

        {shownTicks.map((t) => (
          <g key={t}>
            <line x1={x0 - 5} x2={x0} y1={y(t)} y2={y(t)} stroke="#ccd6d9" />
            <text x={x0 - 9} y={y(t) + 4} fontSize="11" fill="#5f757c" textAnchor="end">
              {money(t).replace(".00", "")}
            </text>
          </g>
        ))}
        <text x={x0 - 9} y={top - 10} fontSize="11" fill="#5f757c" textAnchor="end">
          units
        </text>

        {hasAc && (
          <>
            <path
              d={`M ${xb} ${yCut} h 7 V ${top} h -7`}
              fill="none"
              stroke="#07727d"
              strokeWidth="1.5"
            />
            <text x={xb + 14} y={(top + yCut) / 2 - 4} fontSize="13" fontWeight="600" fill="#07727d">
              Air conditioning
            </text>
            <text x={xb + 14} y={(top + yCut) / 2 + 13} fontSize="12" fill="#5f757c">
              {money(r.acUnits)} units · ৳{money(r.acCost)}
            </text>
          </>
        )}

        <path
          d={`M ${xb} ${bottom} h 7 V ${hasAc ? yCut : top} h -7`}
          fill="none"
          stroke="#a9641d"
          strokeWidth="1.5"
        />
        <text
          x={xb + 14}
          y={((hasAc ? yCut : top) + bottom) / 2 - 4}
          fontSize="13"
          fontWeight="600"
          fill="#a9641d"
        >
          Shared equally
        </text>
        <text x={xb + 14} y={((hasAc ? yCut : top) + bottom) / 2 + 13} fontSize="12" fill="#5f757c">
          {money(r.totalUnits - r.acUnits)} units · ৳{money(r.bill - r.acCost)}
        </text>
      </svg>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* The same result, drawn onto a canvas so it can be saved             */
/* ------------------------------------------------------------------ */

async function receiptImage(r) {
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* system font is fine */
    }
  }

  const INK = "#12242a";
  const MUTED = "#5f757c";
  const LINE = "#ccd6d9";
  const AC = "#07727d";
  const BASE = "#a9641d";

  const S = 2; // retina
  const W = 720;
  const pad = 40;
  const rowH = 42;
  const chartTop = 150 + r.rows.length * rowH;
  const chartH = 320;
  const H = chartTop + chartH + 56;

  const cv = document.createElement("canvas");
  cv.width = W * S;
  cv.height = H * S;
  const g = cv.getContext("2d");
  g.scale(S, S);

  const face = '"Familjen Grotesk", system-ui, sans-serif';
  const write = (t, x, yy, size, weight, color, align) => {
    g.font = `${weight || 400} ${size}px ${face}`;
    g.fillStyle = color || INK;
    g.textAlign = align || "left";
    g.fillText(t, x, yy);
  };
  const rule = (yy, x1, x2, color) => {
    g.strokeStyle = color || LINE;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x1, yy + 0.5);
    g.lineTo(x2, yy + 0.5);
    g.stroke();
  };

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  /* header */
  write("Electricity bill", pad, pad + 22, 26, 700, INK);
  write(
    `৳${money(r.bill)} · ${money(r.totalUnits)} units · ${new Date().toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "long", year: "numeric" }
    )}`,
    pad,
    pad + 44,
    14,
    400,
    MUTED
  );

  /* who pays what */
  let y = 118;
  rule(y - 14, pad, W - pad);
  r.rows.forEach((p) => {
    write(p.name, pad, y + 10, 17, 600, INK);
    write(`৳${money(p.total)}`, W - pad, y + 11, 19, 700, INK, "right");
    rule(y + 24, pad, W - pad);
    y += rowH;
  });

  /* column */
  const top = chartTop + 34;
  const bottom = top + 250;
  const x0 = pad;
  const x1 = pad + 190;
  const xb = x1 + 12;
  const scale = r.totalUnits > 0 ? (bottom - top) / r.totalUnits : 0;
  const py = (u) => bottom - u * scale;

  write("How it was worked out", pad, chartTop + 14, 13, 600, MUTED);

  if (r.totalUnits > 0) {
    const { bands } = bandsOf(r);
    bands.forEach((b) => {
      const yTop = py(b.to);
      const h = py(b.from) - yTop;
      g.fillStyle = b.fill;
      g.fillRect(x0, yTop, x1 - x0, h);
      g.strokeStyle = "#ffffff";
      g.strokeRect(x0, yTop, x1 - x0, h);
      if (h >= 15) {
        write(`৳${b.rate.toFixed(2)}`, x0 + 8, yTop + h / 2 + 4, 12, 400, b.ink);
        write(
          `৳${money(b.cost)}`,
          x1 - 8,
          yTop + h / 2 + 4,
          12,
          400,
          b.ink,
          "right"
        );
      }
    });

    const yCut = py(r.totalUnits - r.acUnits);
    const bracket = (yA, yB, color) => {
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(xb, yA);
      g.lineTo(xb + 7, yA);
      g.lineTo(xb + 7, yB);
      g.lineTo(xb, yB);
      g.stroke();
    };

    if (r.acUnits > 0) {
      bracket(yCut, top, AC);
      write("Air conditioning", xb + 15, (top + yCut) / 2 - 3, 13, 600, AC);
      write(
        `${money(r.acUnits)} units · ৳${money(r.acCost)}`,
        xb + 15,
        (top + yCut) / 2 + 14,
        12,
        400,
        MUTED
      );
    }
    bracket(bottom, r.acUnits > 0 ? yCut : top, BASE);
    write(
      "Shared equally",
      xb + 15,
      ((r.acUnits > 0 ? yCut : top) + bottom) / 2 - 3,
      13,
      600,
      BASE
    );
    write(
      `${money(r.totalUnits - r.acUnits)} units · ৳${money(r.bill - r.acCost)}`,
      xb + 15,
      ((r.acUnits > 0 ? yCut : top) + bottom) / 2 + 14,
      12,
      400,
      MUTED
    );
  }

  /* the two sums, on the right */
  const cx = 430;
  let cy = top + 6;

  write("Air conditioning", cx, cy, 14, 600, AC);
  cy += 20;
  if (r.acUnits > 0) {
    SLABS.map((s, i) => ({ ...s, i, u: r.acPer[i] }))
      .filter((s) => s.u > 0)
      .reverse()
      .forEach((s) => {
        write(`${money(s.u)} × ৳${s.rate.toFixed(2)}`, cx, cy, 12.5, 400, MUTED);
        write(money(s.u * s.rate), W - pad, cy, 12.5, 400, INK, "right");
        cy += 19;
      });
    rule(cy - 6, cx, W - pad);
    cy += 8;
    write(`${money(r.acUnits)} units`, cx, cy, 12.5, 400, MUTED);
    write(`৳${money(r.acCost)}`, W - pad, cy + 2, 17, 700, INK, "right");
    cy += 20;
    write(`৳${r.rate.toFixed(2)} a unit`, cx, cy, 12, 400, MUTED);
    cy += 34;
  } else {
    write("No AC units this month", cx, cy, 12.5, 400, MUTED);
    cy += 34;
  }

  write("Everything else", cx, cy, 14, 600, BASE);
  cy += 20;
  [
    ["Total bill", money(r.bill)],
    ["Less air conditioning", `−${money(r.acCost)}`],
    ["Left to share", money(r.bill - r.acCost)],
    [`Divided by ${r.rows.length}`, `÷ ${r.rows.length}`],
  ].forEach(([k, v]) => {
    write(k, cx, cy, 12.5, 400, MUTED);
    write(v, W - pad, cy, 12.5, 400, INK, "right");
    cy += 19;
  });
  rule(cy - 6, cx, W - pad);
  cy += 8;
  write("each", cx, cy, 12.5, 400, MUTED);
  write(`৳${money(r.perHead)}`, W - pad, cy + 2, 17, 700, INK, "right");

  write(
    `Air conditioning is charged on the last ${money(
      r.acUnits
    )} units of the month, where power costs most.`,
    pad,
    H - 22,
    12,
    400,
    MUTED
  );

  return cv.toDataURL("image/png");
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

export default function BillForm() {
  const [bill, setBill] = useState("8625");
  const [people, setPeople] = useState([
    { id: 1, name: "Anik", ac: "60" },
    { id: 2, name: "Debasis", ac: "54" },
    { id: 3, name: "Fuad", ac: "106" },
    { id: 4, name: "Alamgir", ac: "0" },
  ]);
  const [result, setResult] = useState(null);
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);

  const saveImage = async () => {
    if (!result) return;
    setBusy(true);
    try {
      setImage(await receiptImage(result));
    } catch {
      setImage("error");
    }
    setBusy(false);
  };

  const setPerson = (id, key, val) => {
    setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, [key]: val } : p)));
    setResult(null);
  };

  const addPerson = () => {
    setPeople((ps) => [
      ...ps,
      { id: Math.max(0, ...ps.map((p) => p.id)) + 1, name: "", ac: "0" },
    ]);
    setResult(null);
  };

  const removePerson = (id) => {
    setPeople((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));
    setResult(null);
  };

  const calculate = () => {
    setResult(split(bill, people));
    setImage(null);
  };

  const onEnter = (e) => {
    if (e.key === "Enter") calculate();
  };

  return (
    <div className="app">
      <style>{CSS}</style>

      <h1>Split the electricity bill</h1>

      <div className="card">
        <label className="field bill">
          <span>Total bill for the month</span>
          <div className="money">
            <span className="taka">৳</span>
            <input
              inputMode="decimal"
              value={bill}
              onChange={(e) => {
                setBill(e.target.value);
                setResult(null);
              }}
              onKeyDown={onEnter}
              aria-label="Total bill in taka"
            />
          </div>
        </label>

        <div className="rows">
          <div className="row head">
            <span>Name</span>
            <span>AC units used</span>
            <span />
          </div>

          {people.map((p) => (
            <div className="row" key={p.id}>
              <input
                value={p.name}
                placeholder="Name"
                onChange={(e) => setPerson(p.id, "name", e.target.value)}
                onKeyDown={onEnter}
                aria-label="Name"
              />
              <input
                className="ac"
                inputMode="decimal"
                value={p.ac}
                onChange={(e) => setPerson(p.id, "ac", e.target.value)}
                onKeyDown={onEnter}
                aria-label={`AC units for ${p.name || "this person"}`}
              />
              <button
                className="x"
                onClick={() => removePerson(p.id)}
                aria-label={`Remove ${p.name || "person"}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="actions">
          <button className="ghost" onClick={addPerson}>
            Add a person
          </button>
          <button className="go" onClick={calculate}>
            Show each share
          </button>
        </div>
      </div>

      {result && (
        <div className="card out">
          {result.capped && (
            <p className="warn">
              The AC units add up to more than the bill covers. Showing the
              split for {money(result.acUnits)} units.
            </p>
          )}

          <ul className="payments">
            {result.rows.map((p) => (
              <li key={p.id}>
                <span className="who">{p.name}</span>
                <span className="amt">৳{money(p.total)}</span>
              </li>
            ))}
          </ul>

          <Column r={result} />

          <div className="calcs">
            <section className="calc ac">
              <h3>Air conditioning</h3>
              {result.acUnits > 0 ? (
                <>
                  <ul>
                    {SLABS.map((s, i) => ({ ...s, i, u: result.acPer[i] }))
                      .filter((s) => s.u > 0)
                      .reverse()
                      .map((s) => (
                        <li key={s.i}>
                          <span>
                            {money(s.u)} units × ৳{s.rate.toFixed(2)}
                          </span>
                          <span className="v">{money(s.u * s.rate)}</span>
                        </li>
                      ))}
                  </ul>
                  <div className="calc-total">
                    <span>{money(result.acUnits)} units</span>
                    <strong>৳{money(result.acCost)}</strong>
                  </div>
                  <p className="calc-note">
                    ৳{result.rate.toFixed(2)} a unit, charged to each AC by its
                    own reading
                  </p>
                </>
              ) : (
                <p className="calc-note">No AC units entered this month.</p>
              )}
            </section>

            <section className="calc base">
              <h3>Everything else</h3>
              <ul>
                <li>
                  <span>Total bill</span>
                  <span className="v">{money(result.bill)}</span>
                </li>
                <li>
                  <span>Less air conditioning</span>
                  <span className="v">−{money(result.acCost)}</span>
                </li>
                <li>
                  <span>Left to share</span>
                  <span className="v">{money(result.bill - result.acCost)}</span>
                </li>
                <li>
                  <span>Divided by {result.rows.length}</span>
                  <span className="v">÷ {result.rows.length}</span>
                </li>
              </ul>
              <div className="calc-total">
                <span>each</span>
                <strong>৳{money(result.perHead)}</strong>
              </div>
              <p className="calc-note">
                Everyone pays this, whether they run an AC or not
              </p>
            </section>
          </div>

          <p className="reconcile">
            ৳{money(result.rows.reduce((a, p) => a + p.total, 0))} collected
            from {money(result.totalUnits)} units — back to the bill exactly.
          </p>

          <div className="save">
            <button className="ghost" onClick={saveImage} disabled={busy}>
              {busy ? "Drawing…" : "Save as image"}
            </button>
            <button className="ghost" onClick={() => window.print()}>
              Save as PDF
            </button>
          </div>
        </div>
      )}

      {image && (
        <div className="sheet" role="dialog" aria-label="Bill image">
          <div className="sheet-inner">
            {image === "error" ? (
              <p className="warn">
                The image could not be drawn here. Use Save as PDF instead.
              </p>
            ) : (
              <>
                <img src={image} alt="Electricity bill summary" />
                <p className="hint">
                  On a phone, press and hold the image to save or send it.
                </p>
                <div className="save">
                  <a className="go" href={image} download="electricity-bill.png">
                    Download
                  </a>
                  <button className="ghost" onClick={() => setImage(null)}>
                    Close
                  </button>
                </div>
              </>
            )}
            {image === "error" && (
              <button className="ghost" onClick={() => setImage(null)}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&display=swap');

.app {
  --paper: #e6eaec;
  --card: #ffffff;
  --ink: #12242a;
  --muted: #5f757c;
  --line: #ccd6d9;
  --ac: #07727d;
  --base: #a9641d;

  font-family: 'Familjen Grotesk', ui-sans-serif, system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  background: var(--paper);
  color: var(--ink);
  padding: 32px 20px 56px;
  min-height: 100%;
  line-height: 1.45;
}
.app * { box-sizing: border-box; }
.app :focus-visible { outline: 2px solid var(--ac); outline-offset: 2px; }

h1 {
  max-width: 560px; margin: 0 auto 20px;
  font-size: clamp(26px, 5vw, 34px); font-weight: 700; letter-spacing: -0.02em;
}

.card {
  max-width: 560px; margin: 0 auto 16px;
  background: var(--card); border-radius: 14px; padding: 20px;
}

.field span { display: block; font-size: 13px; color: var(--muted); margin-bottom: 2px; }
.money { display: flex; align-items: baseline; gap: 6px; border-bottom: 2px solid var(--ink); padding-bottom: 4px; }
.taka { font-size: 26px; font-weight: 500; color: var(--muted); }
.money input {
  font: inherit; font-size: clamp(32px, 7vw, 44px); font-weight: 700; letter-spacing: -0.03em;
  border: 0; background: transparent; color: var(--ink); width: 100%; min-width: 0; padding: 0;
}

.rows { margin-top: 22px; }
.row {
  display: grid; grid-template-columns: 1.6fr 1fr 26px;
  gap: 8px; align-items: center; margin-bottom: 8px;
}
.row.head { margin-bottom: 6px; font-size: 12.5px; color: var(--muted); }
.row.head span:nth-child(2) { text-align: right; }
.row input {
  font: inherit; font-variant-numeric: tabular-nums; width: 100%; min-width: 0;
  border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px;
  background: var(--card); color: var(--ink); font-size: 15px;
}
.row input:focus { border-color: var(--ac); }
.row .ac { text-align: right; }
.x { border: 0; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer; padding: 2px; line-height: 1; }
.x:hover { color: var(--base); }

.actions { display: flex; gap: 10px; align-items: center; margin-top: 18px; }
.ghost {
  border: 1px solid var(--line); background: transparent; font: inherit; font-size: 14px;
  color: var(--ink); padding: 9px 14px; border-radius: 8px; cursor: pointer;
}
.ghost:hover { border-color: var(--ink); }
.go {
  margin-left: auto; border: 0; background: var(--ink); color: #fff; font: inherit;
  font-size: 14px; font-weight: 600; padding: 10px 18px; border-radius: 8px; cursor: pointer;
}
.go:hover { background: var(--ac); }

.warn { margin: 0 0 14px; font-size: 13px; color: var(--base); }

.payments { list-style: none; margin: 0; padding: 0; }
.payments li {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 12px 0; border-bottom: 1px solid var(--line);
}
.payments li:last-child { border-bottom: 0; }
.who { font-size: 16px; font-weight: 600; }
.amt { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }

.chart { margin: 22px 0 0; padding-top: 18px; border-top: 1px solid var(--line); }
.chart figcaption { font-size: 13px; color: var(--muted); margin-bottom: 10px; max-width: 46ch; }
.chart svg { width: 100%; height: auto; display: block; font-family: inherit; font-variant-numeric: tabular-nums; }

.calcs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; }
.calc { border-radius: 10px; padding: 14px 15px; }
.calc.ac { background: #eef6f7; }
.calc.base { background: #f9f1e5; }
.calc h3 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
.calc.ac h3 { color: var(--ac); }
.calc.base h3 { color: var(--base); }
.calc ul { list-style: none; margin: 0; padding: 0; }
.calc li {
  display: flex; justify-content: space-between; gap: 10px;
  font-size: 13px; color: var(--muted); padding: 3px 0;
}
.calc li .v { color: var(--ink); }
.calc-total {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(18,36,42,0.18);
  font-size: 13px; color: var(--muted);
}
.calc-total strong { font-size: 19px; letter-spacing: -0.02em; color: var(--ink); }
.calc-note { margin: 8px 0 0; font-size: 12px; color: var(--muted); }

.reconcile { margin: 14px 0 0; font-size: 12.5px; color: var(--muted); }

.save { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.save .go { text-decoration: none; display: inline-block; margin-left: 0; }
.ghost:disabled { opacity: 0.5; cursor: default; }

.sheet {
  position: fixed; inset: 0; background: rgba(18, 36, 42, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 20;
}
.sheet-inner {
  background: var(--card); border-radius: 14px; padding: 16px;
  max-width: 560px; width: 100%; max-height: 88vh; overflow: auto;
}
.sheet-inner img { width: 100%; height: auto; display: block; border: 1px solid var(--line); border-radius: 8px; }
.hint { margin: 10px 0 0; font-size: 12.5px; color: var(--muted); }

@media print {
  .app { background: #fff; padding: 0; }
  .card { break-inside: avoid; }
  .card:not(.out), .save, .sheet { display: none !important; }
}

@media (max-width: 520px) {
  .calcs { grid-template-columns: 1fr; }
  .actions { flex-direction: column-reverse; align-items: stretch; }
  .go { margin-left: 0; }
}
`;
