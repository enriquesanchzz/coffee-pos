import type { Metadata } from "next";
import { getThemeSettings, themeCssVars } from "@/lib/theme";
import { getBusinessSettings, syncAppTimeZone } from "@/lib/settings";
import { FONT_VARIABLE_CLASSES } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { TimeZoneSync } from "@/components/layout/time-zone-sync";
import { BusinessSettingsProvider } from "@/components/layout/business-settings-context";
import "./globals.css";

// Nombre del negocio desde Configuración → Negocio (antes fijo).
export async function generateMetadata(): Promise<Metadata> {
  const { businessName } = await getBusinessSettings();
  return {
    title: { default: `${businessName} POS`, template: `%s · ${businessName}` },
    description: `Punto de venta para ${businessName}`,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, timeZone, settings] = await Promise.all([
    getThemeSettings(),
    syncAppTimeZone(),
    getBusinessSettings(),
  ]);

  return (
    <html
      lang="es"
      className={cn(FONT_VARIABLE_CLASSES, theme.mode === "oscuro" && "dark")}
      style={themeCssVars(theme)}
    >
      <body>
        <TimeZoneSync timeZone={timeZone} />
        <BusinessSettingsProvider value={settings}>{children}</BusinessSettingsProvider>
      </body>
    </html>
  );
}
