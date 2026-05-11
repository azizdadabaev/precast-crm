"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExampleLoader, type Example } from "./ExampleLoader";
import type { TaperInput } from "../engine";

export interface FormState {
  width1: string;
  width2: string;
  length: string;
  useIrregular: boolean;
  length1: string;
  length2: string;
  beamSpacing: string;
}

const DEFAULT_FORM: FormState = {
  width1: "",
  width2: "",
  length: "",
  useIrregular: false,
  length1: "",
  length2: "",
  beamSpacing: "0.58",
};

/** Convert form state into the engine's TaperInput. Empty fields → NaN, which the engine rejects. */
export function formToInput(f: FormState): TaperInput {
  const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
  return {
    width1: num(f.width1),
    width2: num(f.width2),
    length: num(f.length),
    length1: f.useIrregular ? num(f.length1) : undefined,
    length2: f.useIrregular ? num(f.length2) : undefined,
    beamSpacing: num(f.beamSpacing),
  };
}

export function TaperedInputs({
  onCalculate,
}: {
  onCalculate: (input: TaperInput) => void;
}) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  const beamSpacingDeviates =
    form.beamSpacing.trim() !== "" &&
    Number.isFinite(Number(form.beamSpacing)) &&
    Math.abs(Number(form.beamSpacing) - 0.58) > 1e-6;

  function handleExample(ex: Example) {
    const next: FormState = {
      width1: String(ex.inputs.width1),
      width2: String(ex.inputs.width2),
      length: String(ex.inputs.length),
      useIrregular:
        ex.inputs.length1 !== undefined && ex.inputs.length2 !== undefined,
      length1: ex.inputs.length1 !== undefined ? String(ex.inputs.length1) : "",
      length2: ex.inputs.length2 !== undefined ? String(ex.inputs.length2) : "",
      beamSpacing:
        ex.inputs.beamSpacing !== undefined ? String(ex.inputs.beamSpacing) : "0.58",
    };
    setForm(next);
    onCalculate(formToInput(next));
  }

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-base">Кирувчи маълумотлар<span className="lang-en"> · Inputs</span></CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Width 1 (m)"
            value={form.width1}
            onChange={(v) => set("width1", v)}
            min={0}
            step={0.01}
          />
          <Field
            label="Width 2 (m)"
            value={form.width2}
            onChange={(v) => set("width2", v)}
            min={0}
            step={0.01}
          />
          <Field
            label="Length (m)"
            value={form.length}
            onChange={(v) => set("length", v)}
            min={0}
            step={0.01}
          />
        </div>

        <div className="border-t pt-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.useIrregular}
              onChange={(e) => set("useIrregular", e.target.checked)}
            />
            Тўғри тўртбурчак эмас?<span className="lang-en"> · Irregular quadrilateral?</span>
          </label>
          {form.useIrregular && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Фойдаланиш: икки ён узунлиги фарқ қилса тўлдиринг
                <span className="lang-en"> · Use these only when the two length-direction sides differ.</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Length 1 (m)"
                  value={form.length1}
                  onChange={(v) => set("length1", v)}
                  min={0}
                  step={0.01}
                />
                <Field
                  label="Length 2 (m)"
                  value={form.length2}
                  onChange={(v) => set("length2", v)}
                  min={0}
                  step={0.01}
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-3 space-y-1">
          <Field
            label="Beam spacing (m)"
            value={form.beamSpacing}
            onChange={(v) => set("beamSpacing", v)}
            min={0}
            step={0.001}
          />
          {beamSpacingDeviates && (
            <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded px-2 py-1">
              Стандарт қиймат — 0.58 м. Ўзгартиришингиз ишлаб чиқариш қоидаларига зид.
              <span className="lang-en"> · Standard is 0.58 m. Changing this contradicts factory conventions.</span>
            </p>
          )}
        </div>

        <div className="border-t pt-3 flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => onCalculate(formToInput(form))}
            className="bg-primary"
          >
            Ҳисоблаш<span className="lang-en"> · Calculate</span>
          </Button>
          <ExampleLoader onLoad={handleExample} />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        step={step}
        className="tabular-nums"
      />
    </div>
  );
}
