"use client";

import type { LoyaltyMode } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSettingsSection as resetSettingsSectionAction,
  updateLoyaltySettings as updateLoyaltySettingsAction,
} from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import type { BusinessSettings } from "@/lib/settings-shared";
import { cn } from "@/lib/utils";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateLoyaltySettings = withActionErrors(updateLoyaltySettingsAction);
const resetSettingsSection = withActionErrors(resetSettingsSectionAction);

const MODES: { value: LoyaltyMode; label: string; description: string }[] = [
  {
    value: "SEPARADO",
    label: "Tarjetas separadas",
    description: "Cafetería y Pet Shop llevan su propio saldo y sus propios niveles.",
  },
  {
    value: "GLOBAL",
    label: "Puntos globales",
    description: "Todas las compras suman a un solo saldo y una sola escalera de niveles.",
  },
];

export function LoyaltySettingsForm({ initial }: { initial: BusinessSettings }) {
  const [mode, setMode] = useSyncedState<LoyaltyMode>(initial.loyaltyMode);
  const [cafeRate, setCafeRate] = useSyncedState(String(initial.loyaltyPointsPer100Cafe));
  const [petRate, setPetRate] = useSyncedState(String(initial.loyaltyPointsPer100PetShop));
  const [resetAtTop, setResetAtTop] = useSyncedState(initial.loyaltyResetAtTopLevel);
  const [couponPercent, setCouponPercent] = useSyncedState(String(initial.welcomeCouponPercent));
  const [validDays, setValidDays] = useSyncedState(initial.welcomeCouponValidDays ? String(initial.welcomeCouponValidDays) : "");

  const cafe = Number(cafeRate) || 0;
  const pet = Number(petRate) || 0;
  // Ejemplo en vivo, para que el admin vea qué significa la tasa.
  const exampleCafe = Math.floor((200 * cafe) / 100);
  const examplePet = Math.floor((300 * pet) / 100);

  return (
    <SettingsCard
      title="Puntos y cupón de bienvenida"
      description="Cada compra con cliente suma puntos según lo cobrado (después de descuentos, sin propina). Los cambios aplican a las compras siguientes."
      onSave={() =>
        updateLoyaltySettings({
          loyaltyMode: mode,
          // Vacío no es 0: se manda NaN para que el servidor lo rechace.
          loyaltyPointsPer100Cafe: cafeRate.trim() === "" ? NaN : Number(cafeRate),
          loyaltyPointsPer100PetShop: petRate.trim() === "" ? NaN : Number(petRate),
          loyaltyResetAtTopLevel: resetAtTop,
          welcomeCouponPercent: Number(couponPercent),
          welcomeCouponValidDays: validDays.trim() === "" ? null : Number(validDays),
        })
      }
      onReset={() => resetSettingsSection("lealtad")}
    >
      <div className="flex flex-col gap-1">
        <Label id="loyalty-mode">Cómo se acumulan</Label>
        <div role="radiogroup" aria-labelledby="loyalty-mode" className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                "flex min-h-11 flex-col items-start rounded-md border px-3 py-2 text-left text-sm",
                mode === m.value ? "border-primary bg-primary/10" : "border-input hover:bg-muted"
              )}
            >
              <span className="font-medium">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rate-cafe">Puntos por cada $100 en Cafetería</Label>
          <Input id="rate-cafe" type="number" min="0" max="1000" step="1" value={cafeRate} onChange={(e) => setCafeRate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rate-pet">Puntos por cada $100 en Pet Shop</Label>
          <Input id="rate-pet" type="number" min="0" max="1000" step="1" value={petRate} onChange={(e) => setPetRate(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Ejemplo: $200 en Cafetería + $300 en Pet Shop ={" "}
        {mode === "SEPARADO"
          ? `${exampleCafe} puntos de Cafetería y ${examplePet} de Pet Shop.`
          : `${exampleCafe + examplePet} puntos.`}{" "}
        Se redondea hacia abajo.
      </p>

      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={resetAtTop}
          onChange={(e) => setResetAtTop(e.target.checked)}
        />
        <span>
          <span className="font-medium">Reiniciar al llegar al último nivel</span>
          <span className="block text-xs text-muted-foreground">
            Activado: al alcanzar el nivel más alto los puntos vuelven a 0 (se conserva el excedente) y las recompensas se
            pueden volver a ganar; los niveles y descuentos permanentes empiezan de nuevo. Quien ya pase del tope se
            reinicia en su siguiente compra, sin repetir premios. Desactivado: los puntos se acumulan siempre y el nivel es un estatus.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
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
            placeholder="No vence"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Vacío = no vence.</p>
        </div>
      </div>
    </SettingsCard>
  );
}
