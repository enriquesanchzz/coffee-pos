"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updateBirthdaySettings as updateBirthdaySettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import type { BusinessSettings } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateBirthdaySettings = withActionErrors(updateBirthdaySettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

// Vacío no es 0: se manda NaN para que el servidor lo rechace.
function numberOrNaN(value: string) {
  return value.trim() === "" ? NaN : Number(value);
}

export function BirthdaySettingsForm({ initial }: { initial: BusinessSettings }) {
  const [customerPercent, setCustomerPercent] = useSyncedState(String(initial.birthdayCustomerPercent));
  const [petPercent, setPetPercent] = useSyncedState(String(initial.birthdayPetPercent));
  const [validDays, setValidDays] = useSyncedState(String(initial.birthdayCouponValidDays));

  return (
    <SettingsCard
      title="Cupones de cumpleaños"
      description="El día de su cumpleaños, el cliente recibe un cupón personal para Cafetería y cada una de sus mascotas uno para Pet Shop (a nombre del dueño). Aparecen en caja al seleccionar al cliente y en Clientes → Cumpleaños, para felicitarlo por WhatsApp."
      onSave={() =>
        updateBirthdaySettings({
          birthdayCustomerPercent: numberOrNaN(customerPercent),
          birthdayPetPercent: numberOrNaN(petPercent),
          birthdayCouponValidDays: numberOrNaN(validDays),
        })
      }
      onReset={() => resetSettingsSection("cumpleanos")}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="birthday-customer">Cliente: % en Cafetería</Label>
          <Input
            id="birthday-customer"
            type="number"
            min="0"
            max="100"
            step="1"
            value={customerPercent}
            onChange={(e) => setCustomerPercent(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="birthday-pet">Mascota: % en Pet Shop</Label>
          <Input
            id="birthday-pet"
            type="number"
            min="0"
            max="100"
            step="1"
            value={petPercent}
            onChange={(e) => setPetPercent(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="birthday-days">Vigencia (días)</Label>
          <Input
            id="birthday-days"
            type="number"
            min="1"
            max="60"
            step="1"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        0% = no se regala. El cupón vale desde el día del cumpleaños; si ese día el sistema estuvo apagado, se entrega en
        cuanto vuelva a encender, con el mismo vencimiento. Solo aplica si la fecha de cumpleaños se registró al menos 30 días antes (una fecha capturada o cambiada después
        no da cupón hasta el año siguiente), y como máximo un cupón por mascota registrada.
      </p>
    </SettingsCard>
  );
}
