// Who may edit an order, and what an edit may not undo (owner rules 2026-10-06).
//
// Once ANY truck is loaded the goods on it are history, so only holders of
// `order.editShipped` (the owner) may edit the order, until it is delivered.
// No edit may drop a beam length or the block total below what already left.

export type EditLockReason = 'NO_PERMISSION' | 'CANCELED' | 'DELIVERED' | 'ON_TRUCK' | 'NEEDS_SHIPPED_PERMISSION';

export function editPolicy(i: {
  status: string;
  shipments: Array<{ loadedAt: Date | string | null }>;
  permissions: readonly string[];
}): { allowed: boolean; reason: EditLockReason | null; shipped: boolean } {
  const shipped = i.shipments.some((s) => s.loadedAt != null);
  const lock = (reason: EditLockReason) => ({ allowed: false, reason, shipped });
  if (!i.permissions.includes('order.edit')) return lock('NO_PERMISSION');
  if (i.status === 'CANCELED') return lock('CANCELED');
  if (i.status === 'DELIVERED') return lock('DELIVERED');
  // Single-truck order already on its truck: the whole order left at once.
  if (i.shipments.length === 0 && (i.status === 'LOADED' || i.status === 'DISPATCHED')) return lock('ON_TRUCK');
  if (shipped && !i.permissions.includes('order.editShipped')) return lock('NEEDS_SHIPPED_PERMISSION');
  return { allowed: true, reason: null, shipped };
}

export function editLockMessage(r: EditLockReason): string {
  switch (r) {
    case 'NO_PERMISSION':
      return 'Буюртмаларни таҳрирлашга рухсат йўқ';
    case 'CANCELED':
      return 'Бекор қилинган буюртмани таҳрирлаб бўлмайди';
    case 'DELIVERED':
      return 'Етказилган буюртмани таҳрирлаб бўлмайди';
    case 'ON_TRUCK':
      return 'Буюртма тўлиқ машинага юкланган — таҳрирлаб бўлмайди';
    case 'NEEDS_SHIPPED_PERMISSION':
      return 'Юк жўнатилган — фақат эгаси таҳрирлай олади';
  }
}

export interface FloorViolation {
  /** Beam length key ("4.07"), or null for blocks. */
  length: string | null;
  loaded: number;
  ordered: number;
}

export function loadedFloorViolations(
  next: { beams: Record<string, number>; blocks: number },
  loaded: { beams: Record<string, number>; blocks: number },
): FloorViolation[] {
  const out: FloorViolation[] = [];
  for (const [k, n] of Object.entries(loaded.beams)) {
    const ordered = next.beams[k] ?? 0;
    if (ordered < n) out.push({ length: k, loaded: n, ordered });
  }
  if (next.blocks < loaded.blocks) out.push({ length: null, loaded: loaded.blocks, ordered: next.blocks });
  return out;
}

export function floorViolationMessage(v: FloorViolation[]): string {
  const parts = v.map((x) =>
    x.length == null
      ? `Ғишт: юкланган ${x.loaded}, янгисида ${x.ordered}`
      : `${x.length} м балка: юкланган ${x.loaded}, янгисида ${x.ordered}`,
  );
  return `Юкланганидан кам қилиб бўлмайди — ${parts.join('; ')}`;
}
