// Gazoblok shipment weight + load distribution. NAAC density 611 kg/m³
// (1 block of 0.6×0.3×0.2 m = 0.036 m³ ≈ 22 kg ⇒ 22/0.036 = 611). Per-block
// weight = length×height×thickness × density; per-line weight = blocks × per-block.
// Pure + side-effect free, so the math is unit-testable (mirrors weight-distributor.ts
// for the floor side).

export const GAZOBLOK_DENSITY_KG_PER_M3 = 611;

/** One order line as the distributor sees it. `perBlockKg` is precomputed from
 *  the product dimensions (or the order average when the product was deleted). */
export interface GazoblokLine {
  lineId: string;
  label: string;
  quantity: number; // total blocks of this line on the order
  perBlockKg: number;
}

export interface GazoblokTruck {
  capacityKg: number;
}

/** Weight (kg) of one block of the given dimensions (meters). */
export function blockWeightKg(lengthM: number, heightM: number, thicknessM: number): number {
  return lengthM * heightM * thicknessM * GAZOBLOK_DENSITY_KG_PER_M3;
}

/** Total weight of the whole order. */
export function orderWeightKg(lines: GazoblokLine[]): number {
  return lines.reduce((s, l) => s + l.perBlockKg * l.quantity, 0);
}

/** Total weight of a set of per-line block counts. */
export function loadWeightKg(lines: GazoblokLine[], counts: Record<string, number>): number {
  const byId = new Map(lines.map((l) => [l.lineId, l]));
  let kg = 0;
  for (const [k, v] of Object.entries(counts)) {
    const l = byId.get(k);
    if (l) kg += l.perBlockKg * v;
  }
  return kg;
}

/** Remaining blocks per line after prior shipments (clamped ≥ 0). */
export function calculateGazoblokRemaining(
  lines: GazoblokLine[],
  prevLoaded: Array<Record<string, number>>,
): Record<string, number> {
  const used: Record<string, number> = {};
  for (const s of prevLoaded) {
    for (const [k, v] of Object.entries(s)) used[k] = (used[k] ?? 0) + v;
  }
  const rem: Record<string, number> = {};
  for (const l of lines) rem[l.lineId] = Math.max(0, l.quantity - (used[l.lineId] ?? 0));
  return rem;
}

export interface GazoblokDistribution {
  shipments: Array<{ lines: Record<string, number>; weightKg: number }>;
  warnings: string[];
}

/**
 * Greedy split of the order's blocks across the given trucks, proportional to
 * each truck's capacity share, heaviest lines first (mirrors distributeLoad).
 * The last truck absorbs the rounding remainder. Warns per truck that ends up
 * over capacity.
 */
export function distributeGazoblokLoad(
  lines: GazoblokLine[],
  trucks: GazoblokTruck[],
): GazoblokDistribution {
  const warnings: string[] = [];
  const shipments = trucks.map(() => ({ lines: {} as Record<string, number>, weightKg: 0 }));
  if (shipments.length === 0) return { shipments, warnings };

  const totalCap = trucks.reduce((s, t) => s + t.capacityKg, 0);
  const sorted = [...lines].sort((a, b) => b.perBlockKg - a.perBlockKg);

  for (const line of sorted) {
    let left = line.quantity;
    for (let i = 0; i < shipments.length && left > 0; i++) {
      const isLast = i === shipments.length - 1;
      const give = isLast
        ? left
        : Math.min(left, totalCap > 0 ? Math.round((trucks[i].capacityKg / totalCap) * line.quantity) : 0);
      if (give > 0) {
        shipments[i].lines[line.lineId] = (shipments[i].lines[line.lineId] ?? 0) + give;
        shipments[i].weightKg += give * line.perBlockKg;
        left -= give;
      }
    }
  }

  trucks.forEach((t, i) => {
    if (shipments[i].weightKg > t.capacityKg) {
      warnings.push(`Truck ${i + 1}: ${Math.round(shipments[i].weightKg)}kg > ${t.capacityKg}kg`);
    }
  });
  return { shipments, warnings };
}
