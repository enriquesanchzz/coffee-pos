"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LoyaltyProgram, LoyaltyRewardType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteLoyaltyTier as deleteLoyaltyTierAction, saveLoyaltyTier as saveLoyaltyTierAction } from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const saveLoyaltyTier = withActionErrors(saveLoyaltyTierAction);
const deleteLoyaltyTier = withActionErrors(deleteLoyaltyTierAction);

export type LoyaltyTierRow = {
  id: string;
  program: LoyaltyProgram;
  name: string;
  pointsRequired: number;
  benefits: string | null;
  rewardType: LoyaltyRewardType;
  rewardPercent: number | null;
  rewardVariantId: string | null;
  rewardVariantLabel: string | null;
  rewardValidDays: number | null;
  customerCount: number;
};

const REWARDS: { value: LoyaltyRewardType; label: string; hint: string }[] = [
  { value: "CUPON_PORCENTAJE", label: "Cupón de %", hint: "Un cupón de un solo uso al alcanzar el nivel." },
  { value: "PRODUCTO_GRATIS", label: "Producto gratis", hint: "Un cupón por una pieza del producto elegido." },
  { value: "DESCUENTO_PERMANENTE", label: "Descuento permanente", hint: "Un % en cada compra mientras tenga el nivel." },
  { value: "NINGUNA", label: "Solo estatus", hint: "Sin recompensa automática; el beneficio es informativo." },
];

type Draft = {
  id?: string;
  program: LoyaltyProgram;
  name: string;
  pointsRequired: string;
  benefits: string;
  rewardType: LoyaltyRewardType;
  rewardPercent: string;
  rewardVariantId: string;
  rewardValidDays: string;
};

function describeReward(tier: LoyaltyTierRow, scope: string) {
  switch (tier.rewardType) {
    case "CUPON_PORCENTAJE":
      return `Cupón de ${tier.rewardPercent}%${scope}${tier.rewardValidDays ? `, vence en ${tier.rewardValidDays} días` : ""}`;
    case "PRODUCTO_GRATIS":
      return `${tier.rewardVariantLabel ?? "Producto"} gratis${tier.rewardValidDays ? `, vence en ${tier.rewardValidDays} días` : ""}`;
    case "DESCUENTO_PERMANENTE":
      return `${tier.rewardPercent}% permanente${scope}`;
    case "NINGUNA":
      return "Solo estatus";
  }
}

// Niveles por programa: en modo "tarjetas separadas" Cafetería y Pet Shop
// tienen cada uno su escalera; en "puntos globales", una sola.
export function LoyaltyTiersEditor({
  programs,
  tiers,
  variantOptions,
}: {
  programs: { program: LoyaltyProgram; label: string; scopeLabel: string }[];
  tiers: LoyaltyTierRow[];
  variantOptions: ComboboxOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<LoyaltyTierRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Programa del último intento, para mostrar ahí un error al eliminar.
  const [errorProgram, setErrorProgram] = useState<LoyaltyProgram | null>(null);
  const [isPending, startTransition] = useTransition();
  const notify = useToast();

  function run(task: () => Promise<void>, okMessage: string, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
        notify(okMessage);
        after?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el nivel.");
      }
    });
  }

  function openDraft(d: Draft) {
    setError(null);
    setDraft(d);
  }

  function newDraft(program: LoyaltyProgram): Draft {
    return {
      program,
      name: "",
      pointsRequired: "",
      benefits: "",
      rewardType: "CUPON_PORCENTAJE",
      rewardPercent: "10",
      rewardVariantId: "",
      rewardValidDays: "",
    };
  }

  function editDraft(tier: LoyaltyTierRow): Draft {
    return {
      id: tier.id,
      program: tier.program,
      name: tier.name,
      pointsRequired: String(tier.pointsRequired),
      benefits: tier.benefits ?? "",
      rewardType: tier.rewardType,
      rewardPercent: tier.rewardPercent ? String(tier.rewardPercent) : "",
      rewardVariantId: tier.rewardVariantId ?? "",
      rewardValidDays: tier.rewardValidDays ? String(tier.rewardValidDays) : "",
    };
  }

  function save(d: Draft) {
    run(
      () =>
        saveLoyaltyTier({
          id: d.id,
          program: d.program,
          name: d.name,
          pointsRequired: d.pointsRequired.trim() === "" ? NaN : Number(d.pointsRequired),
          benefits: d.benefits,
          rewardType: d.rewardType,
          rewardPercent: d.rewardPercent.trim() === "" ? null : Number(d.rewardPercent),
          rewardVariantId: d.rewardVariantId || null,
          rewardValidDays: d.rewardValidDays.trim() === "" ? null : Number(d.rewardValidDays),
        }),
      d.id ? "Nivel actualizado." : "Nivel creado.",
      () => setDraft(null)
    );
  }

  return (
    <>
      {programs.map(({ program, label, scopeLabel }) => {
        const list = tiers.filter((t) => t.program === program);
        const editingHere = draft?.program === program;
        return (
          <Card key={program}>
            <CardHeader>
              <CardTitle as="h3">Niveles · {label}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Al juntar los puntos de un nivel con sus compras, el cliente recibe su recompensa como cupón personal; en
                caja aparece al seleccionarlo. Los cupones de una vez son para quien llegue al nivel de ahora en adelante;
                el descuento permanente aplica a todos los que ya lo tienen.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {list.length === 0 && <p className="text-sm text-muted-foreground">Sin niveles todavía.</p>}
              <ul className="flex flex-col divide-y divide-border">
                {list.map((tier) => (
                  <li key={tier.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {tier.name}{" "}
                        <span className="font-normal text-muted-foreground">
                          · desde {tier.pointsRequired} pts · {tier.customerCount} cliente{tier.customerCount === 1 ? "" : "s"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {describeReward(tier, scopeLabel)}
                        {tier.benefits && ` · ${tier.benefits}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => openDraft(editDraft(tier))}>
                        Editar
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setToDelete(tier)}>
                        Eliminar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              {editingHere && draft ? (
                <TierForm
                  draft={draft}
                  onChange={setDraft}
                  variantOptions={variantOptions}
                  isPending={isPending}
                  onSave={() => save(draft)}
                  onCancel={() => setDraft(null)}
                />
              ) : (
                <Button type="button" variant="outline" className="w-fit" onClick={() => openDraft(newDraft(program))}>
                  + Agregar nivel
                </Button>
              )}
              {error && (editingHere || (!draft && errorProgram === program)) && <Alert variant="error">{error}</Alert>}
            </CardContent>
          </Card>
        );
      })}
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar nivel"
        message={
          toDelete
            ? `Los cupones de un uso ya entregados se respetan; si daba un descuento permanente, cada cliente pasa al de su nivel restante.${
                toDelete.customerCount > 0
                  ? ` ${toDelete.customerCount} cliente${toDelete.customerCount === 1 ? "" : "s"} lo ${toDelete.customerCount === 1 ? "tiene" : "tienen"} hoy.`
                  : ""
              }`
            : ""
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          const tier = toDelete;
          setToDelete(null);
          if (tier) {
            setErrorProgram(tier.program);
            run(() => deleteLoyaltyTier(tier.id), "Nivel eliminado.");
          }
        }}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

function TierForm({
  draft,
  onChange,
  variantOptions,
  isPending,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  variantOptions: ComboboxOption[];
  isPending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const needsPercent = draft.rewardType === "CUPON_PORCENTAJE" || draft.rewardType === "DESCUENTO_PERMANENTE";
  const isOneTime = draft.rewardType === "CUPON_PORCENTAJE" || draft.rewardType === "PRODUCTO_GRATIS";
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{draft.id ? "Editar nivel" : "Nuevo nivel"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tier-name">Nombre</Label>
          <Input id="tier-name" value={draft.name} maxLength={40} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tier-points">Puntos para alcanzarlo</Label>
          <Input
            id="tier-points"
            type="number"
            min="0"
            step="1"
            value={draft.pointsRequired}
            onChange={(e) => onChange({ ...draft, pointsRequired: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label id="tier-reward">Recompensa</Label>
        <div role="radiogroup" aria-labelledby="tier-reward" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {REWARDS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={draft.rewardType === r.value}
              onClick={() => onChange({ ...draft, rewardType: r.value })}
              className={cn(
                "min-h-11 rounded-md border px-2 py-2 text-sm font-medium",
                draft.rewardType === r.value ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{REWARDS.find((r) => r.value === draft.rewardType)?.hint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {needsPercent && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="tier-percent">% de descuento</Label>
            <Input
              id="tier-percent"
              type="number"
              min="1"
              max="100"
              step="1"
              value={draft.rewardPercent}
              onChange={(e) => onChange({ ...draft, rewardPercent: e.target.value })}
            />
          </div>
        )}
        {draft.rewardType === "PRODUCTO_GRATIS" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="tier-variant">Producto que se regala</Label>
            <Combobox
              id="tier-variant"
              options={variantOptions}
              value={draft.rewardVariantId}
              onChange={(value) => onChange({ ...draft, rewardVariantId: value })}
              placeholder="Buscar producto…"
            />
          </div>
        )}
        {isOneTime && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="tier-days">Vigencia del cupón (días)</Label>
            <Input
              id="tier-days"
              type="number"
              min="1"
              step="1"
              placeholder="No vence"
              value={draft.rewardValidDays}
              onChange={(e) => onChange({ ...draft, rewardValidDays: e.target.value })}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="tier-benefits">Texto para el cliente (opcional)</Label>
        <Input
          id="tier-benefits"
          maxLength={200}
          placeholder="ej. ¡Ya eres cliente Bestie!"
          value={draft.benefits}
          onChange={(e) => onChange({ ...draft, benefits: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isPending} onClick={onSave}>
          {isPending ? "Guardando..." : "Guardar nivel"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
