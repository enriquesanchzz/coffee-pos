"use client";

import {
  resetSettingsSection as resetSettingsSectionAction,
  updateInventorySettings as updateInventorySettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import { SHORTAGE_POLICY_LABELS, type BusinessSettings, type ShortagePolicy } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateInventorySettings = withActionErrors(updateInventorySettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

export function InventorySettingsForm({ initial }: { initial: BusinessSettings }) {
  const [policy, setPolicy] = useSyncedState<ShortagePolicy>(initial.shortagePolicy);

  return (
    <SettingsCard
      title="Venta sin insumos suficientes"
      description="Qué pasa cuando el inventario dice que no alcanzan los insumos para lo que se está cobrando."
      onSave={() => updateInventorySettings({ shortagePolicy: policy })}
      onReset={() => resetSettingsSection("inventario")}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Venta sin insumos suficientes</legend>
        {(Object.keys(SHORTAGE_POLICY_LABELS) as ShortagePolicy[]).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="shortage-policy"
              value={value}
              checked={policy === value}
              onChange={() => setPolicy(value)}
            />
            {SHORTAGE_POLICY_LABELS[value]}
          </label>
        ))}
      </fieldset>
    </SettingsCard>
  );
}
