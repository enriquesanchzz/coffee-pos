import type { Metadata } from "next";
import { getThemeSettings, themeCssVars } from "@/lib/theme";
import { FONT_VARIABLE_CLASSES } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nomada Café POS",
  description: "Punto de venta para Nomada Café",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getThemeSettings();

  return (
    <html
      lang="es"
      className={cn(FONT_VARIABLE_CLASSES, theme.mode === "oscuro" && "dark")}
      style={themeCssVars(theme)}
    >
      <body>{children}</body>
    </html>
  );
}
