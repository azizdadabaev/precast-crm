"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrewError } from "@/components/crew-pay/shared";
import { addDays } from "@/lib/crew-pay/engine";
import { fmtDay, fmtPct, fmtSom } from "@/lib/crew-pay/format";
import { todayTashkent } from "@/lib/crew-pay/rules";
import type { SettingsView } from "@/lib/crew-pay/views";

const KEY_UZ = {
  BREAK_ALLOWANCE: { label: "Синишга рухсат", help: "Қолипланганнинг шу улушигача синган блок ҳам тўланади. 0% = фақат сифатли блок тўланади." },
  DEBT_CAP: { label: "Эски қарзни ушлаб қолиш чегараси", help: "Ҳафталик иш ҳақининг энг кўпи билан шу улуши эски қарзга ушлаб қолинади. Меҳнат кодекси 270-модда: расмий ишчилар учун 50% дан ошмаслиги керак." },
  REJECT_ALARM: { label: "Брак огоҳлантириши", help: "Брак шу фоиздан ошса огоҳлантирилади (одатда 2–5%, 8% дан юқори — қуритиш ёки ташишда муаммо)." },
} as const;
type Key = keyof typeof KEY_UZ;

export default function CrewSettingsPage() {
  const qc = useQueryClient();
  const { data, error } = useQuery<SettingsView>({ queryKey: ["crew-pay", "settings"], queryFn: () => api("/api/crew-pay/settings") });
  const minDate = data?.lastClosedWeek ? addDays(data.lastClosedWeek, 7) : todayTashkent();
  const [rate, setRate] = useState({ effectiveFrom: "", ratePerBlock: "" });
  const [setting, setSetting] = useState({ key: "DEBT_CAP" as Key, percent: "", effectiveFrom: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["crew-pay"] });
  const addRate = useMutation({
    mutationFn: () => api("/api/crew-pay/settings", { method: "POST", json: { kind: "rate", effectiveFrom: rate.effectiveFrom, ratePerBlock: Number(rate.ratePerBlock) } }),
    onSuccess: () => { setRate({ effectiveFrom: "", ratePerBlock: "" }); refresh(); },
  });
  const addSetting = useMutation({
    mutationFn: () => api("/api/crew-pay/settings", { method: "POST", json: { kind: "setting", key: setting.key, value: Number(setting.percent.replace(",", ".")) / 100, effectiveFrom: setting.effectiveFrom } }),
    onSuccess: () => { setSetting({ ...setting, percent: "", effectiveFrom: "" }); refresh(); },
  });

  return (
    <div className="space-y-6">
      <CrewError error={error} />
      <section className="space-y-2">
        <h2 className="font-semibold">Блок учун ставка</h2>
        <p className="text-sm text-muted-foreground">Ставка ўзгарса, янги қатор қўшинг — эски ҳафталар эски ставкада қолади. Ставкани пасайтиришдан 2 ой олдин ишчиларни ёзма огоҳлантириш керак (Меҳнат кодекси 247-модда).</p>
        <table className="text-sm"><tbody>
          {data?.rates.length === 0 && <tr><td className="text-muted-foreground">Ҳали ставка йўқ — пул ҳисобланиши учун аввал ставка киритинг</td></tr>}
          {data?.rates.map((r) => (
            <tr key={r.effectiveFrom}><td className="pr-6 font-mono tabular-nums">{fmtDay(r.effectiveFrom)}.{r.effectiveFrom.slice(0, 4)} дан</td>
              <td className="font-mono tabular-nums">{fmtSom(r.ratePerBlock)} сўм / блок</td></tr>
          ))}
        </tbody></table>
        <div className="flex flex-wrap gap-2">
          <Input type="date" min={minDate} className="w-44" value={rate.effectiveFrom} onChange={(e) => setRate({ ...rate, effectiveFrom: e.target.value })} />
          <Input inputMode="numeric" placeholder="сўм / блок" className="w-36 font-mono tabular-nums" value={rate.ratePerBlock}
            onChange={(e) => setRate({ ...rate, ratePerBlock: e.target.value.replace(/\D/g, "") })} />
          <Button disabled={!rate.effectiveFrom || !rate.ratePerBlock || addRate.isPending} onClick={() => addRate.mutate()}>Қўшиш</Button>
        </div>
        <CrewError error={addRate.error} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Қоидалар</h2>
        {(Object.keys(KEY_UZ) as Key[]).map((k) => (
          <div key={k} className="rounded-md border p-3 text-sm">
            <div className="font-medium">{KEY_UZ[k].label}</div>
            <div className="text-muted-foreground">{KEY_UZ[k].help}</div>
            <div className="mt-1 font-mono tabular-nums">
              {data?.settings.filter((s) => s.key === k).map((s) => `${fmtDay(s.effectiveFrom)}.${s.effectiveFrom.slice(0, 4)} дан ${fmtPct(s.value)}`).join(" · ") || "—"}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={setting.key} onChange={(e) => setSetting({ ...setting, key: e.target.value as Key })}>
            {(Object.keys(KEY_UZ) as Key[]).map((k) => <option key={k} value={k}>{KEY_UZ[k].label}</option>)}
          </select>
          <Input inputMode="decimal" placeholder="%" className="w-24 font-mono tabular-nums" value={setting.percent}
            onChange={(e) => setSetting({ ...setting, percent: e.target.value.replace(/[^\d,.]/g, "") })} />
          <Input type="date" min={minDate} className="w-44" value={setting.effectiveFrom} onChange={(e) => setSetting({ ...setting, effectiveFrom: e.target.value })} />
          <Button disabled={!setting.percent || !setting.effectiveFrom || addSetting.isPending} onClick={() => addSetting.mutate()}>Қўшиш</Button>
        </div>
        <CrewError error={addSetting.error} />
      </section>
    </div>
  );
}
