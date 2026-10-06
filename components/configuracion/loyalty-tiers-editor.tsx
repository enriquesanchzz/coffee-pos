"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteLoyaltyTier as deleteLoyaltyTierAction, saveLoyaltyTier as saveLoyaltyTierAction } from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";

const saveLoyaltyTier = withActionErrors(saveLoyaltyTierAction);
const deleteLoyaltyTier = withActionErrors(deleteLoyaltyTierAction);

export type LoyaltyTierRow = { id: string; name: string; minLifetimeStamps: number; benefits: string | null; cardCount: number };

type Draft = { id?: string; name: string; minLifetimeStamps: string; benefits: string };
const EMPTY: Draft = { name: "", minLifetimeStamps: "", benefits: "" };

// Niveles de lealtad (Regular / Frecuente / VIP…). Un cliente sube de nivel
// según sus compras totales; el nivel y su beneficio se ven en su tarjeta.
export function LoyaltyTiersEditor({ tiers }: { tiers: LoyaltyTierRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<LoyaltyTierRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(task: () => Promise<void>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
        after?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el nivel.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Niveles de cliente</CardTitle>
        <p className="text-sm text-muted-foreground">
          El nivel se asigna solo según el número de compras del cliente y su beneficio aparece en la tarjeta. Los
          beneficios son informativos: se aplican en caja con un código o descuento.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tiers.length === 0 && <p className="text-sm text-muted-foreground">Sin niveles todavía.</p>}
        <ul className="flex flex-col divide-y divide-border">
          {tiers.map((tier) => (
            <li key={tier.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {tier.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · desde {tier.minLifetimeStamps} compra{tier.minLifetimeStamps === 1 ? "" : "s"} ·{" "}
                    {tier.cardCount} cliente{tier.cardCount === 1 ? "" : "s"}
                  </span>
                </p>
                {tier.benefits && <p className="text-xs text-muted-foreground">{tier.benefits}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      id: tier.id,
                      name: tier.name,
                      minLifetimeStamps: String(tier.minLifetimeStamps),
                      benefits: tier.benefits ?? "",
                    })
                  }
                >
                  Editar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setToDelete(tier)}>
                  Eliminar
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {draft ? (
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">{draft.id ? "Editar nivel" : "Nuevo nivel"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="tier-name">Nombre</Label>
                <Input id="tier-name" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="tier-min">Desde cuántas compras</Label>
                <Input
                  id="tier-min"
                  type="number"
                  min="0"
                  step="1"
                  value={draft.minLifetimeStamps}
                  onChange={(e) => setDraft({ ...draft, minLifetimeStamps: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="tier-benefits">Beneficio (opcional)</Label>
              <Input
                id="tier-benefits"
                maxLength={200}
                placeholder="ej. 10% en bebidas frías"
                value={draft.benefits}
                onChange={(e) => setDraft({ ...draft, benefits: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(
                    () =>
                      saveLoyaltyTier({
                        id: draft.id,
                        name: draft.name,
                        minLifetimeStamps: Number(draft.minLifetimeStamps),
                        benefits: draft.benefits,
                      }),
                    () => setDraft(null)
                  )
                }
              >
                {isPending ? "Guardando..." : "Guardar nivel"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setDraft(EMPTY)}>
            + Agregar nivel
          </Button>
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </CardContent>
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar nivel"
        message={
          toDelete && toDelete.cardCount > 0
            ? `${toDelete.cardCount} cliente${toDelete.cardCount === 1 ? "" : "s"} con este nivel quedará${toDelete.cardCount === 1 ? "" : "n"} sin nivel hasta su siguiente compra.`
            : "El nivel se eliminará."
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          const tier = toDelete;
          setToDelete(null);
          if (tier) run(() => deleteLoyaltyTier(tier.id));
        }}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
