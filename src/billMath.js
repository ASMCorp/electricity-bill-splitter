export const SLABS = [
  { units: 75, rate: 6.18 },
  { units: 124, rate: 8.5 },
  { units: 99, rate: 9.1 },
  { units: 99, rate: 9.62 },
  { units: 199, rate: 15.01 },
  { units: Infinity, rate: 17.35 },
];

export const numberFrom = (value) => {
  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const formatMoney = (value) =>
  (Number.isFinite(value) ? value : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function unitsFromBill(bill, slabs = SLABS) {
  let remaining = bill;
  const perSlab = slabs.map(() => 0);

  for (let index = 0; index < slabs.length && remaining > 0; index += 1) {
    const slab = slabs[index];
    const unlimited = slab.units === null || slab.units === Infinity;
    const capacity = unlimited ? Infinity : slab.units * slab.rate;
    if (remaining >= capacity) {
      perSlab[index] = slab.units;
      remaining -= capacity;
    } else {
      perSlab[index] = remaining / slab.rate;
      remaining = 0;
    }
  }

  return perSlab;
}

function priceAcUnits(perSlab, acUnits, slabs) {
  let remaining = acUnits;
  let cost = 0;
  const acPerSlab = slabs.map(() => 0);

  for (let index = slabs.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const units = Math.min(remaining, perSlab[index]);
    acPerSlab[index] = units;
    cost += units * slabs[index].rate;
    remaining -= units;
  }

  return { cost, acPerSlab };
}

export function splitBill(billText, people, slabs = SLABS) {
  const bill = numberFrom(billText);
  const perSlab = unitsFromBill(bill, slabs);
  const totalUnits = perSlab.reduce((sum, units) => sum + units, 0);
  const requestedAcUnits = people.reduce((sum, person) => sum + numberFrom(person.ac), 0);
  const acUnits = Math.min(requestedAcUnits, totalUnits);
  const allocationScale = requestedAcUnits > totalUnits && requestedAcUnits > 0
    ? totalUnits / requestedAcUnits
    : 1;
  const { cost: acCost, acPerSlab } = priceAcUnits(perSlab, acUnits, slabs);
  const acRate = acUnits > 0 ? acCost / acUnits : 0;
  const sharedPerPerson = people.length > 0 ? (bill - acCost) / people.length : 0;

  return {
    bill,
    tariffSnapshot: slabs.map((slab) => ({ ...slab })),
    totalUnits,
    perSlab,
    acPerSlab,
    acUnits,
    acCost,
    acRate,
    sharedPerPerson,
    capped: requestedAcUnits > totalUnits + 1e-9,
    rows: people.map((person) => {
      const units = numberFrom(person.ac) * allocationScale;
      const acAmount = units * acRate;
      return {
        id: person.id,
        name: person.name.trim() || "Unnamed",
        color: person.color,
        u: units,
        ac: acAmount,
        shared: sharedPerPerson,
        total: sharedPerPerson + acAmount,
      };
    }),
  };
}
