"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeChildHref, type NavChild } from "@/lib/navigation";

// Columna de secciones a la izquierda con el mismo esquema que las
// categorías del POS, Inventario y Productos (CategoryDrilldown): ancho
// w-36/w-48, pastillas redondas, la activa llena. Se usa para navegar
// entre sub-secciones de un módulo (Compras, Reportes) y como filtro de
// categoría (Promociones, Descuentos).
export const sectionColumnClass = "flex w-36 flex-shrink-0 flex-col gap-1 overflow-y-auto p-2 sm:w-48 sm:p-3";

export function sectionPillClass(active: boolean) {
  return cn(
    "flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
  );
}

// Secciones que son rutas: la activa se calcula con la URL actual.
export function SectionLinksNav({
  label,
  sections,
  active,
}: {
  label: string;
  sections: NavChild[];
  // Si no se da, se deduce de la URL (prefijo más largo).
  active?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = active ?? activeChildHref(pathname, searchParams, sections);
  return (
    <nav aria-label={label} className={sectionColumnClass}>
      {sections.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={current === s.href ? "page" : undefined}
          className={sectionPillClass(current === s.href)}
        >
          <span className="truncate">{s.label}</span>
        </Link>
      ))}
    </nav>
  );
}

// Layout de módulo: columna de secciones + contenido con su propio scroll,
// a toda la altura (requiere AuthenticatedShell con contentClassName
// "overflow-hidden", igual que Inventario/Productos).
export function SectionLayout({
  title,
  description,
  nav,
  children,
}: {
  // Encabezado del módulo a todo lo ancho (h1), igual que Inventario.
  title: string;
  description?: string;
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex min-h-0 flex-1">
        {nav}
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
