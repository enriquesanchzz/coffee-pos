"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updateReminderSettings as updateReminderSettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import { REMINDER_PLACEHOLDERS, type BusinessSettings } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateReminderSettings = withActionErrors(updateReminderSettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

export const TEXTAREA_CLASS =
  "min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Vacío no es 0: se manda NaN para que el servidor lo rechace.
function numberOrNaN(value: string) {
  return value.trim() === "" ? NaN : Number(value);
}

export function ReminderSettingsForm({ initial }: { initial: BusinessSettings }) {
  const [cafeDays, setCafeDays] = useSyncedState(String(initial.reminderCafeDays));
  const [cafeMessage, setCafeMessage] = useSyncedState(initial.reminderCafeMessage);
  const [petDays, setPetDays] = useSyncedState(String(initial.reminderPetShopDays));
  const [petMessage, setPetMessage] = useSyncedState(initial.reminderPetShopMessage);

  return (
    <SettingsCard
      title="Recordatorios por WhatsApp"
      description="Aparecen en Clientes → Recordatorios con el mensaje listo; quien atiende lo manda con un clic (no hay envío automático todavía)."
      onSave={() =>
        updateReminderSettings({
          reminderCafeDays: numberOrNaN(cafeDays),
          reminderCafeMessage: cafeMessage,
          reminderPetShopDays: numberOrNaN(petDays),
          reminderPetShopMessage: petMessage,
        })
      }
      onReset={() => resetSettingsSection("recordatorios")}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Cafetería · Te extrañamos</legend>
        <div className="flex max-w-xs flex-col gap-1">
          <Label htmlFor="reminder-cafe-days">Días sin comprar café</Label>
          <Input
            id="reminder-cafe-days"
            type="number"
            min="0"
            max="365"
            step="1"
            value={cafeDays}
            onChange={(e) => setCafeDays(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="reminder-cafe-message">Mensaje</Label>
          <textarea
            id="reminder-cafe-message"
            className={TEXTAREA_CLASS}
            maxLength={500}
            value={cafeMessage}
            onChange={(e) => setCafeMessage(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Puedes usar {REMINDER_PLACEHOLDERS.CAFE.join(" ")}.</p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Pet Shop · Resurtido</legend>
        <div className="flex max-w-xs flex-col gap-1">
          <Label htmlFor="reminder-pet-days">Días después de la compra</Label>
          <Input
            id="reminder-pet-days"
            type="number"
            min="0"
            max="365"
            step="1"
            value={petDays}
            onChange={(e) => setPetDays(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="reminder-pet-message">Mensaje para todos los productos</Label>
          <textarea
            id="reminder-pet-message"
            className={TEXTAREA_CLASS}
            maxLength={500}
            value={petMessage}
            onChange={(e) => setPetMessage(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Puedes usar {REMINDER_PLACEHOLDERS.PET_SHOP.join(" ")} ({"{mascota}"} = el nombre de sus mascotas, o “tu
            mascota”). Si un producto necesita otro mensaje u otros días, cámbialo al editar el producto.
          </p>
        </div>
      </fieldset>

      <p className="text-xs text-muted-foreground">
        0 días = apagado. Se le manda un solo WhatsApp por cliente aunque tenga varios productos pendientes, y no se
        repite hasta que vuelva a comprar.
      </p>
    </SettingsCard>
  );
}
