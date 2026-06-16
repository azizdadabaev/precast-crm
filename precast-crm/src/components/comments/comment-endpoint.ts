/** The comments API base for a specific comment, by where it's anchored.
 *  An order's thread shows BOTH the order's own comments and its source draft's
 *  (project) comments — so edit/delete must target the comment's OWN entity,
 *  not the page it's displayed on. */
export function commentBase(c: { orderId: string | null; projectId: string | null }): string {
  return c.orderId
    ? `/api/orders/${c.orderId}/comments`
    : `/api/projects/${c.projectId}/comments`;
}
