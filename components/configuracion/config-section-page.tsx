import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ConfiguracionLayout } from "./configuracion-layout";

// Marco de cada pantalla de Configuración: shell, columna de secciones y
// el encabezado de la sección (h2, bajo el h1 "Configuración").
export function ConfigSectionPage({
  employeeName,
  title,
  description,
  children,
}: {
  employeeName: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedShell isAdmin employeeName={employeeName} contentClassName="overflow-hidden">
      <ConfiguracionLayout>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </ConfiguracionLayout>
    </AuthenticatedShell>
  );
}
