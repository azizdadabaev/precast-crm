// Pure functions — no DB, no React. Safe to import anywhere.

export interface BeamGroup {
  beamLength: string; // e.g. "3.3" — matches Calculation.beamLength.toString()
  totalCount: number;
}

export interface TruckCapacity {
  capacityKg: number;
}

export interface ShipmentLoad {
  beams: Record<string, number>; // beamLength → count
  blocks: number;
  totalWeightKg: number;
  usedCapacityPct: number; // may exceed 100 if overloaded
}

export interface DistributeResult {
  shipments: ShipmentLoad[];
  warnings: string[];
}

/** kg weight for one beam of the given length (metres). 1 m = 32 kg. */
export function beamWeightKg(beamLength: string): number {
  return parseFloat(beamLength) * 32;
}

/** Total weight of an order's components in kg. */
export function calculateOrderWeight(
  beamGroups: BeamGroup[],
  totalBlocks: number,
): number {
  const beamKg = beamGroups.reduce(
    (s, g) => s + beamWeightKg(g.beamLength) * g.totalCount,
    0,
  );
  return beamKg + totalBlocks * 16;
}

/**
 * Distribute beams and blocks across trucks proportionally by capacity.
 * Beams are distributed longest-first (heaviest per unit); blocks fill
 * remaining space proportionally. Last truck absorbs rounding remainders.
 */
export function distributeLoad(
  beamGroups: BeamGroup[],
  totalBlocks: number,
  truckCapacities: TruckCapacity[],
): DistributeResult {
  const warnings: string[] = [];
  const n = truckCapacities.length;
  const totalCap = truckCapacities.reduce((s, t) => s + t.capacityKg, 0);
  const totalWeight = calculateOrderWeight(beamGroups, totalBlocks);

  if (totalWeight > totalCap) {
    warnings.push(
      `Умумий вазн (${Math.round(totalWeight)} кг) умумий сиғимдан (${totalCap} кг) ошади`,
    );
  }

  const loads: ShipmentLoad[] = truckCapacities.map(() => ({
    beams: {},
    blocks: 0,
    totalWeightKg: 0,
    usedCapacityPct: 0,
  }));

  // Longest beam first so heaviest items land on highest-capacity trucks
  const sorted = [...beamGroups].sort(
    (a, b) => parseFloat(b.beamLength) - parseFloat(a.beamLength),
  );

  for (const group of sorted) {
    const unitKg = beamWeightKg(group.beamLength);
    let left = group.totalCount;

    for (let i = 0; i < n; i++) {
      const share =
        i === n - 1
          ? left
          : Math.round((truckCapacities[i].capacityKg / totalCap) * group.totalCount);
      const give = Math.min(share, left);
      loads[i].beams[group.beamLength] = give;
      loads[i].totalWeightKg += give * unitKg;
      left -= give;
    }
    // Safety: if rounding left a residual, give to last truck
    if (left > 0) {
      const last = loads[n - 1];
      last.beams[group.beamLength] = (last.beams[group.beamLength] ?? 0) + left;
      last.totalWeightKg += left * beamWeightKg(group.beamLength);
    }
  }

  // Distribute blocks
  let blocksLeft = totalBlocks;
  for (let i = 0; i < n; i++) {
    const share =
      i === n - 1
        ? blocksLeft
        : Math.round((truckCapacities[i].capacityKg / totalCap) * totalBlocks);
    const give = Math.min(share, blocksLeft);
    loads[i].blocks = give;
    loads[i].totalWeightKg += give * 16;
    blocksLeft -= give;
  }

  // Finalize pct + per-truck overload warnings
  for (let i = 0; i < n; i++) {
    loads[i].usedCapacityPct = Math.round(
      (loads[i].totalWeightKg / truckCapacities[i].capacityKg) * 100,
    );
    if (loads[i].totalWeightKg > truckCapacities[i].capacityKg) {
      warnings.push(
        `Жўнатма ${i + 1}: ${Math.round(loads[i].totalWeightKg)} кг > ${truckCapacities[i].capacityKg} кг сиғим`,
      );
    }
  }

  return { shipments: loads, warnings };
}

/**
 * Calculate what's left to ship after some shipments have been loaded.
 * completedLoads: array of { loadedBeams, loadedBlocks } from LOADED/DISPATCHED/DELIVERED shipments.
 */
export function calculateRemaining(
  beamGroups: BeamGroup[],
  totalBlocks: number,
  completedLoads: Array<{ loadedBeams: Record<string, number>; loadedBlocks: number }>,
): { remainingBeams: Record<string, number>; remainingBlocks: number } {
  const used: Record<string, number> = {};
  let usedBlocks = 0;

  for (const s of completedLoads) {
    for (const [len, cnt] of Object.entries(s.loadedBeams)) {
      used[len] = (used[len] ?? 0) + cnt;
    }
    usedBlocks += s.loadedBlocks;
  }

  const remainingBeams: Record<string, number> = {};
  for (const g of beamGroups) {
    remainingBeams[g.beamLength] = Math.max(0, g.totalCount - (used[g.beamLength] ?? 0));
  }

  return {
    remainingBeams,
    remainingBlocks: Math.max(0, totalBlocks - usedBlocks),
  };
}
