"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updateSecuritySettings as updateSecuritySettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import type { BusinessSettings } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateSecuritySettings = withActionErrors(updateSecuritySettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

export function SecuritySettingsForm({ initial }: { initial: BusinessSettings }) {
  const [attempts, setAttempts] = useSyncedState(String(initial.pinMaxAttempts));
  const [lockMinutes, setLockMinutes] = useSyncedState(String(initial.pinLockMinutes));
  const [sessionHours, setSessionHours] = useSyncedState(String(initial.sessionHours));

  return (
    <SettingsCard
      title="Acceso"
      onSave={() =>
        updateSecuritySettings({
          pinMaxAttempts: Number(attempts),
          pinLockMinutes: Number(lockMinutes),
          sessionHours: Number(sessionHours),
        })
      }
      onReset={() => resetSettingsSection("seguridad")}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pin-attempts">Intentos fallidos antes de bloquear</Label>
          <Input id="pin-attempts" type="number" min="3" max="20" step="1" value={attempts} onChange={(e) => setAttempts(e.target.value)} />
          <p className="text-xs text-muted-foreground">Aplica a PIN y password, desde el mismo equipo. Entre 3 y 20.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pin-lock">Minutos de bloqueo</Label>
          <Input id="pin-lock" type="number" min="1" max="120" step="1" value={lockMinutes} onChange={(e) => setLockMinutes(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="session-hours">Duración de la sesión (horas)</Label>
          <Input
            id="session-hours"
            type="number"
            min="1"
            max="24"
            step="1"
            value={sessionHours}
            onChange={(e) => setSessionHours(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Después se vuelve a pedir PIN o password. Entre 1 y 24.</p>
        </div>
      </div>
    </SettingsCard>
  );
}
