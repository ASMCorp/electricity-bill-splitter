import { formatMoney } from "./billMath.js";

const SLAB_COLORS = ["#f6c85f", "#ed9b40", "#df6c4f", "#c94c67", "#8f4f9f", "#4e4b8b"];

export const formatUnits = (value) =>
  (Number.isFinite(value) ? value : 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export const initials = (name) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";

export function activeSlabs(result) {
  let lowerBound = 0;
  return result.tariffSnapshot.map((slab, index) => {
    const used = result.perSlab[index];
    const lower = lowerBound;
    const upper = lower + used;
    lowerBound = upper;
    return {
      index,
      used,
      lower,
      upper,
      rate: slab.rate,
      acUnits: result.acPerSlab[index],
      sharedUnits: used - result.acPerSlab[index],
      cost: used * slab.rate,
      color: SLAB_COLORS[index % SLAB_COLORS.length],
    };
  }).filter((slab) => slab.used > 0);
}

export async function createReceipt(result) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // The system font is an acceptable fallback.
    }
  }

  const scale = 2;
  const width = 760;
  const padding = 48;
  const rowHeight = 78;
  const slabs = activeSlabs(result);
  const height = 220 + result.rows.length * rowHeight + slabs.length * 54 + 110;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  context.scale(scale, scale);

  const font = '"Familjen Grotesk", system-ui, sans-serif';
  const text = (value, x, y, size = 14, weight = 400, color = "#13252b", align = "left") => {
    context.font = `${weight} ${size}px ${font}`;
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  };
  const line = (y) => {
    context.strokeStyle = "#dce3e5";
    context.beginPath();
    context.moveTo(padding, y + 0.5);
    context.lineTo(width - padding, y + 0.5);
    context.stroke();
  };

  context.fillStyle = "#f4f6f6";
  context.fillRect(0, 0, width, height);
  text("ELECTRICITY SPLIT", padding, 54, 12, 700, "#64777d");
  text(`৳${formatMoney(result.bill)}`, padding, 104, 42, 700);
  text(`${formatUnits(result.totalUnits)} units`, width - padding, 101, 18, 600, "#64777d", "right");
  line(136);

  let y = 180;
  result.rows.forEach((person) => {
    context.fillStyle = person.color;
    context.beginPath();
    context.arc(padding + 20, y - 8, 20, 0, Math.PI * 2);
    context.fill();
    text(initials(person.name), padding + 20, y - 3, 12, 700, "#ffffff", "center");
    text(person.name, padding + 54, y - 10, 18, 700);
    text(`${formatUnits(person.u)} AC units`, padding + 54, y + 12, 13, 400, "#64777d");
    text(`৳${formatMoney(person.total)}`, width - padding, y, 23, 700, person.color, "right");
    line(y + 30);
    y += rowHeight;
  });

  text("TARIFF SLABS", padding, y + 4, 12, 700, "#64777d");
  y += 38;
  slabs.forEach((slab) => {
    context.fillStyle = slab.color;
    context.fillRect(padding, y - 18, 8, 34);
    text(`Slab ${slab.index + 1}`, padding + 22, y - 2, 15, 700);
    text(`৳${slab.rate.toFixed(2)} / unit`, padding + 118, y - 2, 13, 400, "#64777d");
    text(`${formatUnits(slab.used)} units`, width - 190, y - 2, 13, 400, "#64777d", "right");
    text(`৳${formatMoney(slab.cost)}`, width - padding, y - 2, 15, 700, "#13252b", "right");
    y += 54;
  });

  line(y - 12);
  text("Shared per person", padding, y + 24, 14, 400, "#64777d");
  text(`৳${formatMoney(result.sharedPerPerson)}`, width - padding, y + 24, 18, 700, "#13252b", "right");
  return canvas.toDataURL("image/png");
}
