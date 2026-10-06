import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { getTargetFoodCostPercent } from "@/lib/recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/configuracion/settings-form";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";

export const metadata: Metadata = { title: "Configuración · Costos y precios" };

export default async function ConfiguracionCostosPage() {
  const { actor } = await loadConfigurationPage();
  const targetFoodCostPercent = await getTargetFoodCostPercent();

  return (
    <ConfigSectionPage
      employeeName={actor.name}
      title="Costos y precios"
      description="Cómo se calcula el precio sugerido de recetas y extras."
    >
      <Card>
        <CardHeader>
          <CardTitle as="h3">Food cost objetivo</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm targetFoodCostPercent={targetFoodCostPercent} />
        </CardContent>
      </Card>
    </ConfigSectionPage>
  );
}
