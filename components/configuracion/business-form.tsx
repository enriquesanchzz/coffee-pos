"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateBusinessInfo as updateBusinessInfoAction } from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import { COMMON_TIME_ZONES, type BusinessSettings } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateBusinessInfo = withActionErrors(updateBusinessInfoAction);

export function BusinessForm({ initial }: { initial: BusinessSettings }) {
  const [businessName, setBusinessName] = useSyncedState(initial.businessName);
  const [phone, setPhone] = useSyncedState(initial.phone ?? "");
  const [address, setAddress] = useSyncedState(initial.address ?? "");
  const [timeZone, setTimeZone] = useSyncedState(initial.timeZone);
  // Si la zona guardada no está en la lista corta, se agrega para no perderla.
  const zones = COMMON_TIME_ZONES.some((z) => z.value === initial.timeZone)
    ? COMMON_TIME_ZONES
    : [{ value: initial.timeZone, label: initial.timeZone }, ...COMMON_TIME_ZONES];

  return (
    <SettingsCard
      title="Datos del negocio"
      description="Se muestran en el inicio de sesión, el menú, la pestaña del navegador, la tarjeta de lealtad y el mensaje de WhatsApp."
      onSave={() => updateBusinessInfo({ businessName, phone, address, timeZone })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="business-name">Nombre del negocio</Label>
          <Input id="business-name" value={businessName} maxLength={60} onChange={(e) => setBusinessName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="business-phone">Teléfono (opcional)</Label>
          <Input
            id="business-phone"
            type="tel"
            inputMode="tel"
            placeholder="10 dígitos"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="business-address">Dirección (opcional)</Label>
        <Input
          id="business-address"
          maxLength={200}
          placeholder="Calle, número, colonia, ciudad"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="business-tz">Zona horaria</Label>
        <Select id="business-tz" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
          {zones.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Define qué cuenta como &quot;hoy&quot; en Caja y Reportes y cuándo se activan las promociones por horario.
        </p>
      </div>
    </SettingsCard>
  );
}
