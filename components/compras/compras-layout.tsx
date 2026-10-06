"use client";

import { SectionLayout, SectionLinksNav } from "@/components/layout/section-nav";
import { COMPRAS_SECTIONS } from "@/lib/navigation";

// Todas las pantallas de Compras comparten la columna de secciones (Órdenes,
// Proveedores, Transferencias, Conteos físicos), igual que las categorías
// del POS; la sección activa sale de la URL, así que una orden, un
// proveedor o un conteo abiertos dejan marcada su sección.
export function ComprasLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionLayout
      title="Compras"
      description="Órdenes de compra, proveedores, transferencias y conteos físicos."
      nav={<SectionLinksNav label="Secciones de Compras" sections={COMPRAS_SECTIONS} />}
    >
      {children}
    </SectionLayout>
  );
}
