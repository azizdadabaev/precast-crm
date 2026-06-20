import type { PlanPrimitive } from "@/lib/cad/sheet/sheet-plan";

export function SheetSvg({ widthMm, heightMm, primitives }: { widthMm: number; heightMm: number; primitives: PlanPrimitive[] }) {
  const anchor = (a: "L" | "C" | "R") => (a === "L" ? "start" : a === "R" ? "end" : "middle");
  return (
    <svg width={`${widthMm}mm`} height={`${heightMm}mm`} viewBox={`0 0 ${widthMm} ${heightMm}`} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={widthMm} height={heightMm} fill="#ffffff" />
      {primitives.map((p, i) => {
        if (p.type === "rect") {
          const fill = p.role === "beam" ? "#2563eb" : p.role === "bearing" ? "#94a3b8" : p.role === "block" ? "#dbeafe" : p.role === "bom" ? "#eef2f7" : "none";
          const stroke = p.role === "outline" ? "#0f172a" : p.role === "bom" ? "#cbd5e1" : "#1e40af";
          const fillOpacity = p.role === "outline" ? 0 : p.role === "bom" ? 1 : 0.85;
          return <rect key={i} x={p.xMm} y={p.yMm} width={p.wMm} height={p.hMm} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={p.role === "outline" ? 0.35 : p.role === "bom" ? 0.15 : 0.12} />;
        }
        if (p.type === "line") return <line key={i} x1={p.x1Mm} y1={p.y1Mm} x2={p.x2Mm} y2={p.y2Mm} stroke="#475569" strokeWidth={0.18} />;
        return <text key={i} x={p.xMm} y={p.yMm} fontSize={p.sizeMm} fontFamily="Helvetica, Arial, sans-serif" fontWeight={p.role === "name" ? 700 : 500} fill="#0f172a" textAnchor={anchor(p.align)} dominantBaseline="middle">{p.text}</text>;
      })}
    </svg>
  );
}
