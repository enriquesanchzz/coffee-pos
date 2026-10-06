import Link from "next/link";

// Encabezado común de las páginas de Administración (E1): h1, descripción
// opcional y una sola acción primaria a la derecha (E3). En celular la
// acción baja debajo del título en vez de apretarse a su lado.
export function PageHeader({
  title,
  description,
  action,
  children,
  level = 1,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: { href: string; label: string };
  children?: React.ReactNode;
  // 2 cuando la página vive dentro de un módulo con su propio h1
  // (SectionLayout de Compras).
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className="text-lg font-semibold">{title}</Heading>
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
