"use client";

import { SectionLayout, SectionLinksNav } from "@/components/layout/section-nav";
import { CONFIGURACION_SECTIONS } from "@/lib/navigation";

// Configuración con el mismo esquema que el POS/Compras: encabezado del
// módulo, columna con un tipo de ajuste por sección y el formulario a la
// derecha. Las secciones nuevas se agregan en lib/navigation.ts.
export function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionLayout
      title="Configuración"
      description="Ajustes globales de la sucursal."
      nav={<SectionLinksNav label="Secciones de Configuración" sections={CONFIGURACION_SECTIONS} />}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">{children}</div>
    </SectionLayout>
  );
}
