import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { getThemeSettings } from "@/lib/theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppearanceForm } from "@/components/configuracion/appearance-form";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";

export const metadata: Metadata = { title: "Configuración · Apariencia" };

export default async function ConfiguracionAparienciaPage() {
  const { actor } = await loadConfigurationPage();
  const themeSettings = await getThemeSettings();

  return (
    <ConfigSectionPage
      employeeName={actor.name}
      title="Apariencia"
      description="Colores, tipo y tamaño de letra de todo el sistema."
    >
      <Card>
        <CardHeader>
          <CardTitle as="h3">Tema</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearanceForm initial={themeSettings} />
        </CardContent>
      </Card>
    </ConfigSectionPage>
  );
}
