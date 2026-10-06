"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updateDiscountSettings as updateDiscountSettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import type { BusinessSettings } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateDiscountSettings = withActionErrors(updateDiscountSettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

export function DiscountSettingsForm({ initial }: { initial: BusinessSettings }) {
  const [limited, setLimited] = useSyncedState(initial.maxManualDiscountPercent !== null);
  const [percent, setPercent] = useSyncedState(String(initial.maxManualDiscountPercent ?? 30));

  return (
    <SettingsCard
      title="Descuento manual"
      description="El descuento manual se autoriza con el PIN de un gerente o administrador. Los códigos de descuento no tienen este tope: su valor se define en cada código."
      onSave={() => updateDiscountSettings({ maxManualDiscountPercent: limited ? Number(percent) : null })}
      onReset={() => resetSettingsSection("descuentos")}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={limited} onChange={(e) => setLimited(e.target.checked)} />
        Limitar el descuento manual
      </label>
      {limited ? (
        <div className="flex w-full flex-col gap-1 sm:w-72">
          <Label htmlFor="max-manual">Máximo (% del subtotal)</Label>
          <Input id="max-manual" type="number" min="1" max="100" step="1" value={percent} onChange={(e) => setPercent(e.target.value)} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sin tope: se puede descontar hasta el subtotal completo.</p>
      )}
    </SettingsCard>
  );
}
