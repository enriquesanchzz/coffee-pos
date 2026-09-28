import type { CSSProperties } from "react";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";

// Apariencia global del sistema (ver prisma/schema.prisma Branch.theme*).
// Acento y fondo son hex libres (validados por formato, no contra una
// lista cerrada) — antes eran 5 paletas curadas, pero un cajero/admin real
// pidió poder elegir el color exacto de su marca, no solo escoger entre 5
// opciones. El contraste (texto sobre el acento/fondo elegido) se calcula
// en código vía luminancia relativa (WCAG), no se guarda a mano por color.

export type ThemeMode = "claro" | "oscuro";
export type ThemeFontFamilyKey = "sans" | "rounded" | "serif";
export type ThemeFontSizeKey = "sm" | "md" | "lg";

export type ThemeSettings = {
  mode: ThemeMode;
  color: string; // hex, ej. "#5a3a24" — acento (--primary)
  backgroundColor: string | null; // hex u null = usar el fondo por defecto de `mode`
  fontFamily: ThemeFontFamilyKey;
  fontSize: ThemeFontSizeKey;
};

export const THEME_DEFAULTS: ThemeSettings = {
  mode: "claro",
  color: "#5a3a24",
  backgroundColor: null,
  fontFamily: "sans",
  fontSize: "md",
};

// Fondos por defecto de cada modo — mismos valores que app/globals.css
// :root/.dark, para que el picker de "color de fondo" arranque mostrando
// el fondo real actual en vez de un valor arbitrario.
export const DEFAULT_BACKGROUND_HEX: Record<ThemeMode, string> = {
  claro: "#fbf9f6",
  oscuro: "#1c1714",
};

// Acentos sugeridos — quick-picks encima del selector de color libre, no
// una lista cerrada (el input de hex/color sigue aceptando cualquier
// valor).
export const ACCENT_SUGGESTIONS: { label: string; hex: string }[] = [
  { label: "Café", hex: "#5a3a24" },
  { label: "Azul", hex: "#3b5bdb" },
  { label: "Verde", hex: "#2f9e5c" },
  { label: "Morado", hex: "#7c4dcc" },
  { label: "Rosa", hex: "#d6336c" },
];

export const FONT_FAMILIES: Record<ThemeFontFamilyKey, { label: string; stack: string }> = {
  sans: { label: "Sans (default)", stack: "var(--font-sans), ui-sans-serif, sans-serif" },
  rounded: { label: "Redondeada", stack: "var(--font-rounded), ui-sans-serif, sans-serif" },
  serif: { label: "Serif", stack: "var(--font-serif), ui-serif, serif" },
};

export const FONT_SIZES: Record<ThemeFontSizeKey, { label: string; rootPx: number }> = {
  sm: { label: "Pequeño", rootPx: 14 },
  md: { label: "Mediano (default)", rootPx: 16 },
  lg: { label: "Grande", rootPx: 18 },
};

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isHex(value: string): boolean {
  return HEX_PATTERN.test(value);
}
function isThemeMode(value: string | null): value is ThemeMode {
  return value === "claro" || value === "oscuro";
}
function isThemeFontFamilyKey(value: string | null): value is ThemeFontFamilyKey {
  return !!value && value in FONT_FAMILIES;
}
function isThemeFontSizeKey(value: string | null): value is ThemeFontSizeKey {
  return !!value && value in FONT_SIZES;
}

export async function getThemeSettings(): Promise<ThemeSettings> {
  const branch = await prisma.branch.findUnique({ where: { id: DEFAULT_BRANCH_ID } });
  const mode = isThemeMode(branch?.themeMode ?? null) ? (branch!.themeMode as ThemeMode) : THEME_DEFAULTS.mode;
  return {
    mode,
    color: isHex(branch?.themeColor ?? "") ? branch!.themeColor! : THEME_DEFAULTS.color,
    backgroundColor: isHex(branch?.themeBackgroundColor ?? "") ? branch!.themeBackgroundColor! : null,
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
  backgroundColor?: string | null;
  fontFamily: string;
  fontSize: string;
}): ThemeSettings {
  if (!isThemeMode(input.mode)) throw new Error("Modo de tema inválido.");
  if (!isHex(input.color)) throw new Error("El color de acento debe ser un hex válido (#RRGGBB).");
  if (input.backgroundColor && !isHex(input.backgroundColor)) {
    throw new Error("El color de fondo debe ser un hex válido (#RRGGBB).");
  }
  if (!isThemeFontFamilyKey(input.fontFamily)) throw new Error("Tipografía inválida.");
  if (!isThemeFontSizeKey(input.fontSize)) throw new Error("Tamaño de letra inválido.");
  return {
    mode: input.mode,
    color: input.color,
    backgroundColor: input.backgroundColor || null,
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

// "H S% L%" — mismo formato que las variables de app/globals.css.
function hexToHslString(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rN) h = (gN - bN) / d + (gN < bN ? 6 : 0);
    else if (max === gN) h = (bN - rN) / d + 2;
    else h = (rN - gN) / d + 4;
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Luminancia relativa (WCAG) — decide si el texto encima de este color
// debe ser casi blanco o casi negro para quedar legible, en vez de
// tener que curar a mano un "foreground" por cada color posible.
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastForegroundHsl(hex: string): string {
  return relativeLuminance(hex) > 0.5 ? "24 10% 12%" : "30 15% 96%";
}

// Variables CSS inline para <html style={...}> — se resuelven en el server
// component raíz (app/layout.tsx), así que no hay flash de tema incorrecto
// ni necesidad de JS en cliente para aplicar el acento/fondo/tamaño
// elegidos.
export function themeCssVars(settings: ThemeSettings): CSSProperties {
  const vars: Record<string, string> = {
    "--primary": hexToHslString(settings.color),
    "--primary-foreground": contrastForegroundHsl(settings.color),
  };

  // El fondo custom solo sobreescribe --background/--foreground — el
  // resto de los tokens neutros (--muted/--border/--secondary) se quedan
  // como los define `mode` en app/globals.css (:root/.dark), para no
  // requerir derivar toda una paleta neutra a partir de un solo hex.
  if (settings.backgroundColor) {
    vars["--background"] = hexToHslString(settings.backgroundColor);
    vars["--foreground"] = contrastForegroundHsl(settings.backgroundColor);
  }

  return {
    fontSize: `${FONT_SIZES[settings.fontSize].rootPx}px`,
    fontFamily: FONT_FAMILIES[settings.fontFamily].stack,
    ...vars,
  } as CSSProperties;
}
