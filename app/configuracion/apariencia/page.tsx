import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getThemeSettings } from "@/lib/theme";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ConfiguracionLayout } from "@/components/configuracion/configuracion-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppearanceForm } from "@/components/configuracion/appearance-form";

export const metadata: Metadata = { title: "Configuración · Apariencia" };

export default async function ConfiguracionAparienciaPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const themeSettings = await getThemeSettings();

  return (
    <AuthenticatedShell isAdmin employeeName={actor.name} contentClassName="overflow-hidden">
      <ConfiguracionLayout>
        <div>
          <h2 className="text-lg font-semibold">Apariencia</h2>
          <p className="text-sm text-muted-foreground">Colores, tipo y tamaño de letra de todo el sistema.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle as="h3">Tema</CardTitle>
          </CardHeader>
          <CardContent>
            <AppearanceForm initial={themeSettings} />
          </CardContent>
        </Card>
      </ConfiguracionLayout>
    </AuthenticatedShell>
  );
}
