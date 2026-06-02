// Guards the public webhook. Fails closed: if the expected secret is
// unset, every request is rejected (prevents an unconfigured deploy
// from accepting unauthenticated POSTs).
export function isValidWebhookSecret(
  header: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || expected.length === 0) return false;
  if (!header || header.length === 0) return false;
  return header === expected;
}
