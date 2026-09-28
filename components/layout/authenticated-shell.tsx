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
}: {
  isAdmin: boolean;
  employeeName: string;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isAdmin={isAdmin} />
        <div className={cn("flex-1", contentClassName ?? "overflow-y-auto")}>{children}</div>
      </div>
      <SessionBar employeeName={employeeName} isAdmin={isAdmin} />
    </div>
  );
}
