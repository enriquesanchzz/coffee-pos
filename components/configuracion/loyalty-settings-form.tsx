"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updateLoyaltySettings as updateLoyaltySettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import type { BusinessSettings } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateLoyaltySettings = withActionErrors(updateLoyaltySettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

export function LoyaltySettingsForm({ initial }: { initial: BusinessSettings }) {
  const [stamps, setStamps] = useSyncedState(String(initial.loyaltyStampsPerReward));
  const [couponPercent, setCouponPercent] = useSyncedState(String(initial.welcomeCouponPercent));
  const [validDays, setValidDays] = useSyncedState(initial.welcomeCouponValidDays ? String(initial.welcomeCouponValidDays) : "");

  return (
    <SettingsCard
      title="Tarjeta y cupón de bienvenida"
      description="Los cambios aplican a las compras y clientes nuevos; los cupones ya emitidos conservan su valor."
      onSave={() =>
        updateLoyaltySettings({
          loyaltyStampsPerReward: Number(stamps),
          welcomeCouponPercent: Number(couponPercent),
          welcomeCouponValidDays: validDays.trim() === "" ? null : Number(validDays),
        })
      }
      onReset={() => resetSettingsSection("lealtad")}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="stamps-per-reward">Sellos por recompensa</Label>
          <Input id="stamps-per-reward" type="number" min="1" max="20" step="1" value={stamps} onChange={(e) => setStamps(e.target.value)} />
          <p className="text-xs text-muted-foreground">Un sello por compra; al completarlos la tarjeta vuelve a 0.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="welcome-percent">Cupón de bienvenida (%)</Label>
          <Input
            id="welcome-percent"
            type="number"
            min="0"
            max="100"
            step="1"
            value={couponPercent}
            onChange={(e) => setCouponPercent(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">0 = no se regala cupón al registrar un cliente.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="welcome-days">Vigencia del cupón (días)</Label>
          <Input
            id="welcome-days"
            type="number"
            min="1"
            step="1"
            placeholder="Sin vencimiento"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Vacío = no vence.</p>
        </div>
      </div>
    </SettingsCard>
  );
}
