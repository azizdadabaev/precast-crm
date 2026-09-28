# Regenerates the crew-pay golden fixtures from the workbook's own reference
# engine. Run from precast-crm/:  python tests/fixtures/crew-pay/make-fixtures.py
import json, subprocess, sys, pathlib
here = pathlib.Path(__file__).parent
engine = pathlib.Path("scripts/crew-pay/reference_engine.py")
seed = json.loads((here / "seed.json").read_text(encoding="utf-8"))
cap50 = json.loads(json.dumps(seed))
cap50["settings"].append({"key": "debt_cap_pct", "value": 0.5, "effective_from": "2026-09-28"})
# One production day in the 28 Sep week so the 50 % cap is exercised on real debt.
cap50["daily_log"].append({"date": "2026-09-28", "moulded": 2000, "broken": 0,
                           "attendance": {"W01": 1, "W02": 1, "W03": 1, "W04": 1}, "notes": None})
(here / "seed-cap50.json").write_text(json.dumps(cap50, indent=1, ensure_ascii=False), encoding="utf-8")
for src, out in (("seed.json", "golden.json"), ("seed-cap50.json", "golden-cap50.json")):
    res = subprocess.run([sys.executable, str(engine), str(here / src)], capture_output=True, text=True, check=True)
    (here / out).write_text(res.stdout, encoding="utf-8")
print("fixtures written")
