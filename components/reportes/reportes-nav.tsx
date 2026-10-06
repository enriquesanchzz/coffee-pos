import Link from "next/link";
import { cn } from "@/lib/utils";

export type ReportesView = "utilidad" | "recetas" | "inventario" | "estadisticas" | "clientes";

const VIEWS: { value: ReportesView; label: string }[] = [
  { value: "utilidad", label: "Utilidad" },
  { value: "recetas", label: "Recetas" },
  { value: "inventario", label: "Inventario" },
  { value: "estadisticas", label: "Estadísticas" },
  { value: "clientes", label: "Clientes" },
];

// Submenú fijo a la izquierda — mismo lenguaje visual que Sidebar (lista
// vertical, pastilla activa), pero es navegación de SECCIONES dentro de
// una sola ruta (`/reportes?view=X`), no selección de producto, así que
// no usa tarjetas como Productos/Inventario. Server component: el `view`
// activo ya se resuelve en app/reportes/page.tsx a partir de searchParams,
// no hace falta usePathname en cliente.
export function ReportesNav({
  active,
  visible,
}: {
  active: ReportesView;
  visible: ReportesView[];
}) {
  return (
    <nav aria-label="Reportes" className="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col">
      {VIEWS.filter((v) => visible.includes(v.value)).map((v) => (
        <Link
          key={v.value}
          href={`/reportes?view=${v.value}`}
          aria-current={active === v.value ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-2 text-sm font-medium transition-colors",
            active === v.value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
          )}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}
