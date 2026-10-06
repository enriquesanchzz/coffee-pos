"use client";

import { useRouter, usePathname } from "next/navigation";
import { logoutAction } from "@/actions/session";
import { CART_STORAGE_KEY } from "@/components/pos/cart-store";

// Mismos módulos que components/layout/sidebar.tsx (sin el ícono, aquí solo
// hace falta el label para el selector de "zona" — navegar entre secciones
// de la UI, no un concepto de sucursal/estación física, ver docs/CONTINUE.md
// "cambios de administración").
const ZONES = [
  { href: "/pos", label: "Punto de Venta", adminOnly: false },
  { href: "/caja", label: "Caja", adminOnly: false },
  { href: "/clientes", label: "Clientes", adminOnly: true },
  { href: "/descuentos", label: "Códigos de descuento", adminOnly: true },
  { href: "/promociones", label: "Promociones", adminOnly: true },
  { href: "/reportes", label: "Reportes", adminOnly: true },
  { href: "/compras", label: "Compras", adminOnly: true },
  { href: "/productos", label: "Productos", adminOnly: true },
  { href: "/inventario", label: "Inventario", adminOnly: true },
  { href: "/empleados", label: "Empleados", adminOnly: true },
  { href: "/configuracion", label: "Configuración", adminOnly: true },
  { href: "/administracion", label: "Administración", adminOnly: true },
];

export function SessionBar({
  employeeName,
  isAdmin,
}: {
  employeeName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const zones = ZONES.filter((zone) => !zone.adminOnly || isAdmin);
  const currentZone = zones.find(
    (zone) => pathname === zone.href || pathname?.startsWith(`${zone.href}/`)
  );

  return (
    // Franja fija oscura a propósito, independiente del acento/modo elegido
    // en Administración → Apariencia: es un ancla visual constante para
    // identificar quién opera el sistema, no debe cambiar con el tema.
    <footer aria-label="Sesión" className="flex h-12 shrink-0 items-center justify-between gap-2 bg-neutral-900 px-3 text-neutral-50 sm:px-4">
      <p className="min-w-0 truncate text-sm">
        <span className="hidden sm:inline">Atendiendo: </span>
        <span className="font-semibold">{employeeName}</span>
      </p>
      <div className="flex flex-shrink-0 items-center gap-2 sm:gap-4">
        <select
          aria-label="Cambiar de zona"
          value={currentZone?.href ?? ""}
          onChange={(e) => {
            if (e.target.value) router.push(e.target.value);
          }}
          className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-50"
        >
          {zones.map((zone) => (
            <option key={zone.href} value={zone.href}>
              {zone.label}
            </option>
          ))}
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
