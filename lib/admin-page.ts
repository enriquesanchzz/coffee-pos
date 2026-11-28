import "server-only";
import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "./session";
import { DEFAULT_BRANCH_ID } from "./constants";

// Todo lo de la sección "Administración" del menú (Ventas, Clientes,
// Códigos de descuento, Promociones, Reportes, Compras, Productos,
// Inventario, Empleados, Configuración) exige rol ADMINISTRADOR **con
// sesión de email + password** — el PIN de 4 dígitos se teclea a la vista
// en el mostrador y no basta para ver datos de clientes, exportar ventas o
// cambiar el catálogo. Sin esa sesión se manda al login de Administración,
// que regresa a `next` al entrar.
export function adminLoginHref(next: string) {
  return `/administracion/login?next=${encodeURIComponent(next)}`;
}

export async function requireAdminPage(next: string) {
  const actor = await requirePasswordSession();
  if (!actor) redirect(adminLoginHref(next));
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  return actor;
}

// `next` del login: solo rutas internas (nunca "//otro-sitio" ni URLs).
export function safeNextPath(next: string | undefined | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}
