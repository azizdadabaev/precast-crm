import type { CrewIssue } from "./checks";

/** Where a check's problem can be fixed: the checks banner links each message here. */
export function issueHref(i: CrewIssue): string {
  switch (i.code) {
    case "NO_RATE":
    case "RATE_CUT":
      return "/crew-pay/settings";
    case "WEEK_UNPAID":
      return "/crew-pay/pay";
    case "ADVANCE_OVER_BALANCE":
    case "OLD_DEBT":
      return i.workerId ? `/crew-pay/ledger?worker=${i.workerId}` : "/crew-pay/ledger";
    case "SHARE_DRIFT":
    case "REJECT_HIGH":
      return i.weekStart ? `/crew-pay/pay?week=${i.weekStart}` : "/crew-pay/pay";
    default:
      // Day-level problems (nobody present, broken > moulded, no rate that day, …).
      return i.weekStart ? `/crew-pay/days?week=${i.weekStart}` : "/crew-pay/days";
  }
}
