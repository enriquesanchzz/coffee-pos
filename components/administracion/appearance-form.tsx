"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateAppearanceSettings } from "@/actions/settings";
import {
  COLOR_PALETTES,
  FONT_FAMILIES,
  FONT_SIZES,
  type ThemeSettings,
} from "@/lib/theme";

export function AppearanceForm({ initial }: { initial: ThemeSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState<ThemeSettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    setSaved(false);
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
            onChange={(e) => update("mode", e.target.value as ThemeSettings["mode"])}
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

      <div className="flex flex-col gap-1">
        <Label>Color de acento</Label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(COLOR_PALETTES).map(([key, palette]) => (
            <button
              key={key}
              type="button"
              onClick={() => update("color", key as ThemeSettings["color"])}
              title={palette.label}
              aria-pressed={settings.color === key}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform",
                settings.color === key
                  ? "border-foreground scale-110"
                  : "border-transparent hover:scale-105"
              )}
            >
              <span
                className="h-6 w-6 rounded-full"
                style={{ backgroundColor: palette.swatch }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar apariencia"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && !error && <p className="text-sm text-emerald-600">Guardado.</p>}
      </div>
    </div>
  );
}
