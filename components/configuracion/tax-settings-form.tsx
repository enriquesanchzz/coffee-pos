"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updateTaxSettings as updateTaxSettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import { includedTax, TAX_MODE_LABELS, type BusinessSettings, type TaxMode } from "@/lib/settings-shared";
import { formatCurrency } from "@/lib/utils";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateTaxSettings = withActionErrors(updateTaxSettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

export function TaxSettingsForm({ initial }: { initial: BusinessSettings }) {
  const [mode, setMode] = useSyncedState<TaxMode>(initial.taxMode);
  const [rate, setRate] = useSyncedState(String(initial.taxRatePercent));
  const example = includedTax(100, { taxMode: "INCLUIDO", taxRatePercent: Number(rate) || 0 });

  return (
    <SettingsCard
      title="IVA"
      description="El total cobrado no cambia: los precios del menú ya incluyen el impuesto (así lo exige la ley en México para el precio al público). Con el desglose activado, el cobro muestra cuánto IVA contiene y cada venta lo guarda para tus reportes."
      onSave={() => updateTaxSettings({ taxMode: mode, taxRatePercent: Number(rate) })}
      onReset={() => resetSettingsSection("impuestos")}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Modo de impuestos</legend>
        {(Object.keys(TAX_MODE_LABELS) as TaxMode[]).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="tax-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
            {TAX_MODE_LABELS[value]}
          </label>
        ))}
      </fieldset>
      {mode === "INCLUIDO" && (
        <div className="flex w-full flex-col gap-1 sm:w-72">
          <Label htmlFor="tax-rate">Tasa de IVA (%)</Label>
          <Input id="tax-rate" type="number" min="0" max="50" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Ejemplo: una venta de $100.00 contiene {formatCurrency(example)} de IVA.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}
