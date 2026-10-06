import { Suspense } from "react";
import { Sidebar } from "./sidebar";
import { SessionBar } from "./session-bar";
import { cn } from "@/lib/utils";

// Reemplaza el `<div className="flex h-screen"><Sidebar />...` repetido
// literal en las 8 páginas raíz — agrega la barra global de sesión abajo
// (antes solo vivía dentro de PosWorkspace) sin que cada página tenga que
// reservarle espacio a mano: al ser un hermano flex de la fila
// Sidebar+contenido (no `position: fixed`), el layout ya le deja su lugar.
export function AuthenticatedShell({
  isAdmin,
  employeeName,
  children,
  contentClassName,
  srTitle,
}: {
  isAdmin: boolean;
  employeeName: string;
  children: React.ReactNode;
  contentClassName?: string;
  // h1 solo para lectores de pantalla en pantallas sin título visible
  // (POS, Caja, Reportes) — A11Y-06.
  srTitle?: string;
}) {
  return (
    <div className="flex h-screen flex-col">
      {/* A11Y-07: saltar el menú lateral con el teclado. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-primary"
      >
        Saltar al contenido
      </a>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar y SessionBar leen ?view= (useSearchParams). */}
        <Suspense>
          <Sidebar isAdmin={isAdmin} />
        </Suspense>
        <main id="contenido" tabIndex={-1} className={cn("min-w-0 flex-1 focus:outline-none", contentClassName ?? "overflow-y-auto")}>
          {srTitle && <h1 className="sr-only">{srTitle}</h1>}
          {children}
        </main>
      </div>
      <Suspense>
        <SessionBar employeeName={employeeName} isAdmin={isAdmin} />
      </Suspense>
    </div>
  );
}
