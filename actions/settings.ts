"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { requirePasswordSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { validateThemeSettings, type ThemeSettings } from "@/lib/theme";

// Configuración global simple (hoy solo el % de food cost objetivo) —
// exclusiva de Administración, mismo patrón que actions/employees.ts:
// sesión de contraseña (no PIN), el actor sale siempre de la sesión del
// servidor.
export async function updateTargetFoodCostPercent(percent: number) {
  const actor = await requirePasswordSession();
  if (!actor) {
    throw new Error("Necesitas iniciar sesión de Administración para hacer esto.");
  }
  await requirePermission(actor.id, DEFAULT_BRANCH_ID, "CONFIGURACION_SISTEMA_GESTIONAR");

  if (!(percent > 0) || percent > 100) {
    throw new Error("El % de food cost objetivo debe estar entre 0 y 100.");
  }

  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: { targetFoodCostPercent: percent },
  });

  revalidatePath("/administracion");
  revalidatePath("/productos");
}

// Apariencia global (tema, acento, tipografía, tamaño de letra) — mismo
// patrón/permiso que updateTargetFoodCostPercent. Afecta app/layout.tsx,
// que envuelve toda la app, así que revalida desde la raíz.
export async function updateAppearanceSettings(input: {
  mode: string;
  color: string;
  fontFamily: string;
  fontSize: string;
}): Promise<ThemeSettings> {
  const actor = await requirePasswordSession();
  if (!actor) {
    throw new Error("Necesitas iniciar sesión de Administración para hacer esto.");
  }
  await requirePermission(actor.id, DEFAULT_BRANCH_ID, "CONFIGURACION_SISTEMA_GESTIONAR");

  const settings = validateThemeSettings(input);

  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      themeMode: settings.mode,
      themeColor: settings.color,
      themeFontFamily: settings.fontFamily,
      themeFontSize: settings.fontSize,
    },
  });

  revalidatePath("/", "layout");

  return settings;
}
