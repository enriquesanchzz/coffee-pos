import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getTargetFoodCostPercent } from "@/lib/recipes";
import { getThemeSettings } from "@/lib/theme";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/configuracion/settings-form";
import { AppearanceForm } from "@/components/configuracion/appearance-form";

// Configuración del sistema — separada de Administración (ahora un
// dashboard) para que tenga su propia sección de menú, con espacio para
// más opciones en el futuro (pidió el usuario explícitamente).
export default async function ConfiguracionPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const [targetFoodCostPercent, themeSettings] = await Promise.all([
    getTargetFoodCostPercent(),
    getThemeSettings(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={actor.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Configuración del sistema</h1>
          <p className="text-sm text-muted-foreground">Ajustes globales de la sucursal.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm targetFoodCostPercent={targetFoodCostPercent} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Apariencia</CardTitle>
          </CardHeader>
          <CardContent>
            <AppearanceForm initial={themeSettings} />
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
