"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updateShiftSettings as updateShiftSettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import type { BusinessSettings } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateShiftSettings = withActionErrors(updateShiftSettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

export function ShiftSettingsForm({ initial }: { initial: BusinessSettings }) {
  const [hour, setHour] = useSyncedState(String(initial.shiftChangeHour));
  const [openingCash, setOpeningCash] = useSyncedState(String(initial.defaultOpeningCash));
  const [tolerance, setTolerance] = useSyncedState(String(initial.cashDifferenceTolerance));

  return (
    <SettingsCard
      title="Apertura y corte"
      onSave={() =>
        updateShiftSettings({
          shiftChangeHour: Number(hour),
          defaultOpeningCash: Number(openingCash),
          cashDifferenceTolerance: Number(tolerance),
        })
      }
      onReset={() => resetSettingsSection("caja")}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="shift-hour">Turno vespertino a partir de (hora)</Label>
          <Input id="shift-hour" type="number" min="1" max="23" step="1" value={hour} onChange={(e) => setHour(e.target.value)} />
          <p className="text-xs text-muted-foreground">Formato 24 h. Antes de esta hora se sugiere Matutino.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="opening-cash">Fondo de caja sugerido ($)</Label>
          <Input
            id="opening-cash"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Se precarga al abrir turno; se puede cambiar.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cash-tolerance">Diferencia permitida en el corte ($)</Label>
          <Input
            id="cash-tolerance"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Arriba de este monto, el corte exige capturar un motivo.</p>
        </div>
      </div>
    </SettingsCard>
  );
}
