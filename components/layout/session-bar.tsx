"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { activeChildHref, isInModule, visibleModules } from "@/lib/navigation";
import { logoutAction } from "@/actions/session";
import { CART_STORAGE_KEY } from "@/components/pos/cart-store";

// Mismos módulos y sub-secciones que el menú lateral (lib/navigation.ts):
// "zona" = sección de la UI, no sucursal/estación física (ver
// docs/CONTINUE.md "cambios de administración"). Los módulos con
// sub-secciones (Compras, Reportes) se listan como grupo para que en
// celular también se llegue directo a Proveedores, Conteos, etc.
export function SessionBar({
  employeeName,
  isAdmin,
}: {
  employeeName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const modules = visibleModules(isAdmin);
  const currentModule = modules.find((mod) => isInModule(pathname, mod));
  const currentValue = currentModule
    ? activeChildHref(pathname, searchParams, currentModule.children ?? []) ?? currentModule.href
    : "";

  return (
    // Franja fija oscura a propósito, independiente del acento/modo elegido
    // en Administración → Apariencia: es un ancla visual constante para
    // identificar quién opera el sistema, no debe cambiar con el tema.
    <footer aria-label="Sesión" className="flex h-12 shrink-0 items-center border-t border-neutral-700 justify-between gap-2 bg-neutral-900 px-3 text-neutral-50 sm:px-4">
      <p className="min-w-0 truncate text-sm">
        <span className="hidden sm:inline">Atendiendo: </span>
        <span className="font-semibold">{employeeName}</span>
      </p>
      <div className="flex flex-shrink-0 items-center gap-2 sm:gap-4">
        <select
          aria-label="Cambiar de zona"
          value={currentValue}
          onChange={(e) => {
            if (e.target.value) router.push(e.target.value);
          }}
          className="h-9 max-w-[11rem] rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-50 sm:max-w-none"
        >
          {modules.map((mod) =>
            mod.children ? (
              <optgroup key={mod.href} label={mod.label}>
                {mod.children.map((child) => (
                  <option key={child.href} value={child.href}>
                    {child.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={mod.href} value={mod.href}>
                {mod.label}
              </option>
            )
          )}
        </select>
        <form
          action={logoutAction}
          onSubmit={() => {
            // La orden en curso no debe quedar visible para el siguiente
            // empleado que use este navegador (ver cart-store.ts).
            try {
              sessionStorage.removeItem(CART_STORAGE_KEY);
            } catch {
              // sessionStorage no disponible: no hay nada guardado.
            }
          }}
        >
          <button
            type="submit"
            className="min-h-9 whitespace-nowrap px-1 text-sm text-neutral-300 hover:text-neutral-50 hover:underline"
          >
            <span className="sm:hidden">Salir</span>
            <span className="hidden sm:inline">Cambiar de empleado</span>
          </button>
        </form>
      </div>
    </footer>
  );
}
