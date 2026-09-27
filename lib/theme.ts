import type { CSSProperties } from "react";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";

// Apariencia global del sistema (ver prisma/schema.prisma Branch.theme*).
// Claves cerradas y validadas aquí en vez de a nivel de columna: agregar una
// opción nueva significa agregar una entrada a uno de los registros de abajo,
// nunca aceptar un string libre desde el cliente.

export type ThemeMode = "claro" | "oscuro";
export type ThemeColorKey = "cafe" | "azul" | "verde" | "morado" | "rosa";
export type ThemeFontFamilyKey = "sans" | "rounded" | "serif";
export type ThemeFontSizeKey = "sm" | "md" | "lg";

export type ThemeSettings = {
  mode: ThemeMode;
  color: ThemeColorKey;
  fontFamily: ThemeFontFamilyKey;
  fontSize: ThemeFontSizeKey;
};

export const THEME_DEFAULTS: ThemeSettings = {
  mode: "claro",
  color: "cafe",
  fontFamily: "sans",
  fontSize: "md",
};

// HSL "H S% L%" (mismo formato que las variables --primary/etc. de
// globals.css) por paleta y por modo. Solo se sobreescribe --primary/
// --primary-foreground: --secondary/--muted se quedan neutros en ambos
// modos para que un acento fuerte no rompa el contraste del resto de la UI.
// (el anillo de foco usa ring-primary, así que hereda el acento sin variable propia).
export const COLOR_PALETTES: Record<
  ThemeColorKey,
  {
    label: string;
    swatch: string; // color de referencia para el picker, en hex
    light: { primary: string; primaryForeground: string };
    dark: { primary: string; primaryForeground: string };
  }
> = {
  cafe: {
    label: "Café (default)",
    swatch: "#5a3a24",
    light: { primary: "24 45% 30%", primaryForeground: "30 20% 98%" },
    dark: { primary: "28 55% 62%", primaryForeground: "24 30% 12%" },
  },
  azul: {
    label: "Azul",
    swatch: "#3b5bdb",
    light: { primary: "230 60% 50%", primaryForeground: "0 0% 100%" },
    dark: { primary: "228 85% 72%", primaryForeground: "230 40% 12%" },
  },
  verde: {
    label: "Verde",
    swatch: "#2f9e5c",
    light: { primary: "150 55% 32%", primaryForeground: "0 0% 100%" },
    dark: { primary: "150 55% 60%", primaryForeground: "150 40% 10%" },
  },
  morado: {
    label: "Morado",
    swatch: "#7c4dcc",
    light: { primary: "262 55% 47%", primaryForeground: "0 0% 100%" },
    dark: { primary: "262 75% 74%", primaryForeground: "262 40% 12%" },
  },
  rosa: {
    label: "Rosa",
    swatch: "#d6336c",
    light: { primary: "340 65% 47%", primaryForeground: "0 0% 100%" },
    dark: { primary: "340 75% 72%", primaryForeground: "340 40% 12%" },
  },
};

// Cada clave apunta a la variable CSS que expone la fuente autohospedada
// correspondiente en lib/fonts.ts (cargada una vez en app/layout.tsx) — con
// un fallback genérico por si el CSS de next/font no cargó todavía.
export const FONT_FAMILIES: Record<ThemeFontFamilyKey, { label: string; stack: string }> = {
  sans: { label: "Sans (default)", stack: "var(--font-sans), ui-sans-serif, sans-serif" },
  rounded: { label: "Redondeada", stack: "var(--font-rounded), ui-sans-serif, sans-serif" },
  serif: { label: "Serif", stack: "var(--font-serif), ui-serif, serif" },
};

// px de font-size en <html>: escala también spacing/tamaños basados en rem
// (así como el zoom del navegador), a propósito — "grande" debe verse con
// más aire, no solo texto más grande.
export const FONT_SIZES: Record<ThemeFontSizeKey, { label: string; rootPx: number }> = {
  sm: { label: "Pequeño", rootPx: 14 },
  md: { label: "Mediano (default)", rootPx: 16 },
  lg: { label: "Grande", rootPx: 18 },
};

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "claro" || value === "oscuro";
}
function isThemeColorKey(value: string | null): value is ThemeColorKey {
  return !!value && value in COLOR_PALETTES;
}
function isThemeFontFamilyKey(value: string | null): value is ThemeFontFamilyKey {
  return !!value && value in FONT_FAMILIES;
}
function isThemeFontSizeKey(value: string | null): value is ThemeFontSizeKey {
  return !!value && value in FONT_SIZES;
}

export async function getThemeSettings(): Promise<ThemeSettings> {
  const branch = await prisma.branch.findUnique({ where: { id: DEFAULT_BRANCH_ID } });
  return {
    mode: isThemeMode(branch?.themeMode ?? null) ? (branch!.themeMode as ThemeMode) : THEME_DEFAULTS.mode,
    color: isThemeColorKey(branch?.themeColor ?? null)
      ? (branch!.themeColor as ThemeColorKey)
      : THEME_DEFAULTS.color,
    fontFamily: isThemeFontFamilyKey(branch?.themeFontFamily ?? null)
      ? (branch!.themeFontFamily as ThemeFontFamilyKey)
      : THEME_DEFAULTS.fontFamily,
    fontSize: isThemeFontSizeKey(branch?.themeFontSize ?? null)
      ? (branch!.themeFontSize as ThemeFontSizeKey)
      : THEME_DEFAULTS.fontSize,
  };
}

export function validateThemeSettings(input: {
  mode: string;
  color: string;
  fontFamily: string;
  fontSize: string;
}): ThemeSettings {
  if (!isThemeMode(input.mode)) throw new Error("Modo de tema inválido.");
  if (!isThemeColorKey(input.color)) throw new Error("Color de acento inválido.");
  if (!isThemeFontFamilyKey(input.fontFamily)) throw new Error("Tipografía inválida.");
  if (!isThemeFontSizeKey(input.fontSize)) throw new Error("Tamaño de letra inválido.");
  return input as ThemeSettings;
}

// Variables CSS inline para <html style={...}> — se resuelven en el server
// component raíz (app/layout.tsx), así que no hay flash de tema incorrecto
// ni necesidad de JS en cliente para aplicar el acento/tamaño elegidos.
export function themeCssVars(settings: ThemeSettings): CSSProperties {
  const palette = COLOR_PALETTES[settings.color][settings.mode === "oscuro" ? "dark" : "light"];
  return {
    fontSize: `${FONT_SIZES[settings.fontSize].rootPx}px`,
    fontFamily: FONT_FAMILIES[settings.fontFamily].stack,
    ["--primary" as string]: palette.primary,
    ["--primary-foreground" as string]: palette.primaryForeground,
  };
}
