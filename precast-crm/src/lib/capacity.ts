// Daily production capacity tiers in m² — the only place these numbers
// live. Used by the capacity calendar route and the mobile bootstrap.
export const CAPACITY_THRESHOLDS = { low: 300, moderate: 450, heavy: 600 } as const;
