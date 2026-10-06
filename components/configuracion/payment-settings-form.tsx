"use client";

import type { PaymentMethod } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updatePaymentSettings as updatePaymentSettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import { PAYMENT_METHOD_LABELS, type BusinessSettings } from "@/lib/settings-shared";
import { parseIntList, SettingsCard, useSyncedState } from "./settings-card";

const updatePaymentSettings = withActionErrors(updatePaymentSettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

const ALL_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function PaymentSettingsForm({ initial }: { initial: BusinessSettings }) {
  const [tips, setTips] = useSyncedState(initial.tipPercents.join(", "));
  const [threshold, setThreshold] = useSyncedState(String(initial.highTipThresholdPercent));
  const [methods, setMethods] = useSyncedState<PaymentMethod[]>(initial.paymentMethods);
  const [bills, setBills] = useSyncedState(initial.cashQuickBills.join(", "));

  const tipList = tips.trim() === "" ? [] : parseIntList(tips);
  const billList = bills.trim() === "" ? [] : parseIntList(bills);

  function toggleMethod(method: PaymentMethod) {
    setMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
  }

  return (
    <SettingsCard
      title="Propinas y pagos"
      onSave={async () => {
        if (!tipList) throw new Error("Las propinas deben ser números enteros separados por comas (ej. 10, 15, 20).");
        if (!billList) throw new Error("Los billetes deben ser números enteros separados por comas (ej. 50, 100, 200).");
        await updatePaymentSettings({
          tipPercents: tipList,
          highTipThresholdPercent: Number(threshold),
          paymentMethods: methods,
          cashQuickBills: billList,
        });
      }}
      onReset={() => resetSettingsSection("cobro")}
      saveDisabled={methods.length === 0}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="tip-percents">Propinas sugeridas (%)</Label>
        <Input
          id="tip-percents"
          value={tips}
          placeholder="10, 15, 20"
          aria-invalid={!tipList || undefined}
          onChange={(e) => setTips(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Botones de propina en el cobro, separados por comas. Vacío = solo &quot;Sin propina&quot; y &quot;Monto&quot;.
        </p>
      </div>
      <div className="flex w-full flex-col gap-1 sm:w-72">
        <Label htmlFor="tip-threshold">Pedir confirmación si la propina pasa del (% del total)</Label>
        <Input
          id="tip-threshold"
          type="number"
          min="1"
          step="1"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Métodos de pago aceptados</legend>
        {ALL_METHODS.map((method) => (
          <label key={method} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={methods.includes(method)} onChange={() => toggleMethod(method)} />
            {PAYMENT_METHOD_LABELS[method]}
          </label>
        ))}
        {methods.length === 0 && <p className="text-xs text-destructive">Activa al menos un método.</p>}
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor="cash-bills">Botones de billetes en efectivo ($)</Label>
        <Input
          id="cash-bills"
          value={bills}
          placeholder="20, 50, 100, 200, 500, 1000"
          aria-invalid={!billList || undefined}
          onChange={(e) => setBills(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Atajos para capturar lo que entrega el cliente (+$50, +$100…).</p>
      </div>
    </SettingsCard>
  );
}
