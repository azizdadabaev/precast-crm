"""
Donabay reference pay engine (Excel-parity).
This is the SOURCE OF TRUTH for calculations. The web/Android backend must
produce identical numbers for golden_tests.json. Integers are so'm (UZS).
Run:  python reference_engine.py seed_data.json > golden_tests.json
"""
import json, sys, math
from datetime import date, timedelta
from collections import defaultdict

def d(s): return date.fromisoformat(s)
def week_start(x): return x - timedelta(days=x.weekday())          # Monday
def xround(v): return int(math.floor(abs(v) + 0.5)) * (1 if v >= 0 else -1)  # Excel ROUND(v,0): half away from zero

def effective(rows, on, key="effective_from"):
    """Latest row whose effective_from <= on (rates/settings are effective-dated)."""
    cands = [r for r in rows if d(r[key]) <= on]
    return max(cands, key=lambda r: d(r[key])) if cands else None

def setting(seed, key, on):
    r = effective([s for s in seed["settings"] if s["key"] == key], on)
    return r["value"] if r else None

def day_calc(seed, day):
    dt = d(day["date"])
    moulded = day.get("moulded") or 0
    broken = day.get("broken") or 0
    ba = setting(seed, "break_allowance_pct", dt) or 0
    good = moulded - broken
    paid = moulded - max(0, broken - ba * moulded)
    rate_row = effective(seed["pay_rates"], dt)
    rate = rate_row["rate_per_block"] if rate_row else 0
    crew_days = sum(v for v in day["attendance"].values() if v)
    return dict(date=dt, week=week_start(dt), moulded=moulded, broken=broken, good=good,
                paid_blocks=paid, rate=rate, pay_value=paid * rate, crew_days=crew_days,
                attendance=day["attendance"])

def weeks(seed):
    W = defaultdict(lambda: dict(moulded=0, broken=0, good=0, paid_blocks=0, pot=0, crew_days=0,
                                 days=defaultdict(float)))
    for day in seed["daily_log"]:
        c = day_calc(seed, day); w = W[c["week"]]
        for k in ("moulded", "broken", "good", "paid_blocks", "crew_days"): w[k] += c[k]
        w["pot"] += c["pay_value"]
        for code, v in c["attendance"].items():
            if v: w["days"][code] += v
    for ws, w in W.items():
        w["shares"] = {code: (0 if w["crew_days"] == 0 else xround(w["pot"] * dd / w["crew_days"]))
                       for code, dd in w["days"].items()}
        w["reject_rate"] = None if w["moulded"] == 0 else w["broken"] / w["moulded"]
        w["share_drift"] = sum(w["shares"].values()) - w["pot"]   # Excel check tolerates |drift|<=12
    return W

def weekly_pay(seed, wk_start):
    """One row per worker for the pay week starting Monday wk_start (Weekly Pay sheet)."""
    W = weeks(seed); wk_end = wk_start + timedelta(days=6)
    L = [dict(e, _d=d(e["date"])) for e in seed["cash_ledger"]]
    out = []
    for wkr in seed["workers"]:
        code = wkr["code"]
        earned_before = sum(w["shares"].get(code, 0) for s, w in W.items() if s < wk_start)
        cash_before = sum(e["amount"] for e in L if e["worker"] == code and e["_d"] < wk_start)
        in_wk = lambda t: sum(e["amount"] for e in L if e["worker"] == code and e["type"] == t
                              and wk_start <= e["_d"] <= wk_end)
        G = earned_before - cash_before                       # brought forward (+ = owed to worker, - = worker owes)
        wk = W.get(wk_start)
        days = wk["days"].get(code, 0) if wk else 0
        F = wk["shares"].get(code, 0) if wk else 0             # earned this week
        H = in_wk("advance"); I = in_wk("correction"); Lp = in_wk("weekly_pay")
        J = G + F - H - I                                      # due
        debt_cap = setting(seed, "debt_cap_pct", wk_start)
        if G >= 0: K = xround(max(0, J))
        else:      K = xround(max(0, F - H - I - min(-G, debt_cap * F)))   # TO PAY
        M = max(0, K - Lp)                                     # still to pay
        N = J - Lp                                             # carried forward
        n = xround(N)
        status = ("owes_you" if n < 0 else "not_yet_paid" if (n > 0 and M > 0)
                  else "you_owe" if n > 0 else "settled")
        out.append(dict(worker=code, name=wkr["name"], days=days, earned=F, brought_forward=G,
                        advances=H, corrections=I, due=J, to_pay=K, paid=Lp, still_to_pay=M,
                        carried_forward=N, status=status))
    return out

def balance_after(seed, entry_seq):
    """Cash Ledger col L: worker balance after this entry = earned up to & incl. entry's week - cash up to entry date."""
    W = weeks(seed); e = next(x for x in seed["cash_ledger"] if x["seq"] == entry_seq)
    ed = d(e["date"]); code = e["worker"]
    earned = sum(w["shares"].get(code, 0) for s, w in W.items() if s <= week_start(ed))
    cash = sum(x["amount"] for x in seed["cash_ledger"] if x["worker"] == code and d(x["date"]) <= ed)
    return earned - cash

if __name__ == "__main__":
    seed = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "seed_data.json", encoding="utf-8"))
    W = weeks(seed)
    res = {"weeks": [], "weekly_pay": {}, "ledger_balance_after": {}}
    for s in sorted(W):
        w = W[s]
        res["weeks"].append(dict(week_start=s.isoformat(), moulded=w["moulded"], broken=w["broken"],
            good=w["good"], paid_blocks=w["paid_blocks"], pot=w["pot"], crew_days=w["crew_days"],
            days=dict(w["days"]), shares=w["shares"], share_drift=w["share_drift"]))
        res["weekly_pay"][s.isoformat()] = weekly_pay(seed, s)
    for e in seed["cash_ledger"]:
        res["ledger_balance_after"][e["seq"]] = balance_after(seed, e["seq"])
    print(json.dumps(res, indent=1, default=str))
