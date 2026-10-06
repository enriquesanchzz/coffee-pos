import Link from "next/link";
import { cn } from "@/lib/utils";

// Encabezado común de las páginas de Administración (E1): h1, descripción
// opcional y una sola acción primaria a la derecha (E3). En celular la
// acción baja debajo del título en vez de apretarse a su lado.
export function PageHeader({
  title,
  description,
  action,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

const COMPRAS_SECTIONS = [
  { href: "/compras", label: "Órdenes" },
  { href: "/compras/proveedores", label: "Proveedores" },
  { href: "/compras/transferencias", label: "Transferencias" },
  { href: "/compras/conteos", label: "Conteos físicos" },
] as const;

// Sub-navegación de Compras con el mismo patrón de pastillas que Reportes
// (antes eran enlaces sueltos "Proveedores →" / "← Compras").
export function ComprasNav({ active }: { active: (typeof COMPRAS_SECTIONS)[number]["href"] }) {
  return (
    <nav aria-label="Secciones de Compras" className="flex gap-1 overflow-x-auto">
      {COMPRAS_SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={active === s.href ? "page" : undefined}
          className={cn(
            "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors",
            active === s.href ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
