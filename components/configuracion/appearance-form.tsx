"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateAppearanceSettings as updateAppearanceSettingsAction } from "@/actions/settings";
import {
  ACCENT_SUGGESTIONS,
  DEFAULT_BACKGROUND_HEX,
  FONT_FAMILIES,
  FONT_SIZES,
  type ThemeSettings,
} from "@/lib/theme";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const updateAppearanceSettings = withActionErrors(updateAppearanceSettingsAction);

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function AppearanceForm({ initial }: { initial: ThemeSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState<ThemeSettings>(initial);
  const [customBackground, setCustomBackground] = useState(initial.backgroundColor !== null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function toggleCustomBackground(checked: boolean) {
    setCustomBackground(checked);
    update("backgroundColor", checked ? DEFAULT_BACKGROUND_HEX[settings.mode] : null);
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    if (!HEX_PATTERN.test(settings.color)) {
      setError("El color de acento debe ser un hex válido, ej. #5a3a24.");
      return;
    }
    if (customBackground && (!settings.backgroundColor || !HEX_PATTERN.test(settings.backgroundColor))) {
      setError("El color de fondo debe ser un hex válido, ej. #fbf9f6.");
      return;
    }
    startTransition(async () => {
      try {
        await updateAppearanceSettings(settings);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la apariencia.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="theme-mode">Base del sistema</Label>
          <Select
            id="theme-mode"
            value={settings.mode}
            onChange={(e) => {
              const mode = e.target.value as ThemeSettings["mode"];
              update("mode", mode);
              if (!customBackground) return;
              // El fondo custom sigue siendo válido en cualquier modo, pero si
              // todavía tiene el valor por defecto del modo anterior, lo
              // actualizamos al default del nuevo para no dejar un fondo claro
              // "atorado" en modo oscuro o viceversa.
              if (settings.backgroundColor === DEFAULT_BACKGROUND_HEX[settings.mode]) {
                update("backgroundColor", DEFAULT_BACKGROUND_HEX[mode]);
              }
            }}
          >
            <option value="claro">Claro</option>
            <option value="oscuro">Oscuro</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="theme-font-family">Tipo de letra</Label>
          <Select
            id="theme-font-family"
            value={settings.fontFamily}
            onChange={(e) => update("fontFamily", e.target.value as ThemeSettings["fontFamily"])}
            style={{ fontFamily: FONT_FAMILIES[settings.fontFamily].stack }}
          >
            {Object.entries(FONT_FAMILIES).map(([key, font]) => (
              <option key={key} value={key} style={{ fontFamily: font.stack }}>
                {font.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="theme-font-size">Tamaño de letra</Label>
          <Select
            id="theme-font-size"
            value={settings.fontSize}
            onChange={(e) => update("fontSize", e.target.value as ThemeSettings["fontSize"])}
          >
            {Object.entries(FONT_SIZES).map(([key, size]) => (
              <option key={key} value={key}>
                {size.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="theme-color-hex">Color de acento</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Color de acento"
            value={settings.color}
            onChange={(e) => update("color", e.target.value)}
            className="h-9 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          />
          <Input
            id="theme-color-hex"
            value={settings.color}
            onChange={(e) => update("color", e.target.value)}
            placeholder="#5a3a24"
            className="w-32 font-mono"
          />
          <div className="flex flex-wrap gap-1.5">
            {ACCENT_SUGGESTIONS.map((s) => (
              <button
                key={s.hex}
                type="button"
                title={s.label}
                aria-label={`Color ${s.label}`}
                aria-pressed={settings.color.toLowerCase() === s.hex.toLowerCase()}
                onClick={() => update("color", s.hex)}
                className="h-7 w-7 rounded-full border border-border"
                style={{ backgroundColor: s.hex }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={customBackground}
            onChange={(e) => toggleCustomBackground(e.target.checked)}
          />
          Personalizar color de fondo
        </label>
        {customBackground && (
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Color de fondo"
              value={settings.backgroundColor ?? DEFAULT_BACKGROUND_HEX[settings.mode]}
              onChange={(e) => update("backgroundColor", e.target.value)}
              className="h-9 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
            />
            <Input
              id="theme-background-hex"
              value={settings.backgroundColor ?? ""}
              onChange={(e) => update("backgroundColor", e.target.value)}
              placeholder="#fbf9f6"
              className="w-32 font-mono"
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          El texto sobre el acento y el fondo se ajusta solo (claro u oscuro) para que siga siendo legible.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar apariencia"}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {saved && !error && <p className="text-sm text-emerald-600">Guardado.</p>}
      </div>
    </div>
  );
}
