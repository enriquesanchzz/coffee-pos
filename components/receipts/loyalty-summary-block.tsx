import type { SaleLoyaltySummary } from "@/lib/loyalty-points";

// Puntos de una venta: lo que ganó con esta compra, su saldo y su nivel
// por programa, y las recompensas que desbloqueó. Lo usan el ticket
// impreso (/pos/ticket/[saleId]) y el diálogo de "Venta registrada".
export function LoyaltySummaryBlock({ summary, compact = false }: { summary: SaleLoyaltySummary; compact?: boolean }) {
  return (
    <div className={compact ? "flex flex-col gap-1 text-sm" : "flex flex-col gap-1"}>
      <p className="font-bold">Tus puntos</p>
      {summary.programs.map((p) => (
        <div key={p.program}>
          <p className="flex justify-between gap-2">
            <span>{p.label}</span>
            <span>
              {p.earned > 0 ? `+${p.earned}` : p.earned < 0 ? `${p.earned}` : "+0"} pts · saldo {p.points}
            </span>
          </p>
          <p className={compact ? "text-xs text-muted-foreground" : "text-[11px]"}>
            {p.tier ? `Nivel ${p.tier.name}` : "Sin nivel todavía"}
            {p.nextTier && ` · faltan ${p.nextTier.missing} pts para ${p.nextTier.name}`}
          </p>
        </div>
      ))}
      {summary.rewards.map((r, i) => (
        <p key={i} className="font-bold">
          ¡Subiste a {r.tierName}!{r.reward && ` ${r.reward}.`}
          {r.code && ` Tu cupón: ${r.code}`}
        </p>
      ))}
    </div>
  );
}
