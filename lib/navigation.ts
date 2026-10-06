// Única fuente de la navegación: la usan el menú lateral (Sidebar), el
// selector "Cambiar de zona" de la barra de sesión (celular/tablet) y las
// pestañas internas de Compras. Antes cada uno tenía su propia lista y
// las sub-secciones (Proveedores, Transferencias, Conteos físicos, vistas
// de Reportes) solo se alcanzaban desde dentro de su página.

export type NavChild = {
  href: string;
  label: string;
};

export type NavModule = {
  href: string;
  label: string;
  icon: NavIconName;
  // Solo visibles para el rol ADMINISTRADOR (ver lib/session.ts
  // resolveRoleName()).
  adminOnly: boolean;
  // Además del rol, piden email y password (QA-016).
  needsPassword?: boolean;
  children?: NavChild[];
};

export type NavIconName =
  | "pos"
  | "caja"
  | "administracion"
  | "clientes"
  | "descuentos"
  | "promociones"
  | "reportes"
  | "compras"
  | "productos"
  | "inventario"
  | "empleados"
  | "configuracion";

export const COMPRAS_SECTIONS: NavChild[] = [
  { href: "/compras", label: "Órdenes" },
  { href: "/compras/proveedores", label: "Proveedores" },
  { href: "/compras/transferencias", label: "Transferencias" },
  { href: "/compras/conteos", label: "Conteos físicos" },
];

export const REPORTES_SECTIONS: NavChild[] = [
  { href: "/reportes?view=utilidad", label: "Utilidad" },
  { href: "/reportes?view=recetas", label: "Recetas" },
  { href: "/reportes?view=inventario", label: "Inventario" },
  { href: "/reportes?view=estadisticas", label: "Estadísticas" },
  { href: "/reportes?view=clientes", label: "Clientes" },
];

export const NAV_MODULES: NavModule[] = [
  { href: "/pos", label: "Punto de Venta", icon: "pos", adminOnly: false },
  { href: "/caja", label: "Caja", icon: "caja", adminOnly: false },
  { href: "/administracion", label: "Administración", icon: "administracion", adminOnly: true, needsPassword: true },
  { href: "/clientes", label: "Clientes", icon: "clientes", adminOnly: true },
  { href: "/descuentos", label: "Códigos de descuento", icon: "descuentos", adminOnly: true },
  { href: "/promociones", label: "Promociones", icon: "promociones", adminOnly: true },
  { href: "/reportes", label: "Reportes", icon: "reportes", adminOnly: true, children: REPORTES_SECTIONS },
  { href: "/compras", label: "Compras", icon: "compras", adminOnly: true, children: COMPRAS_SECTIONS },
  { href: "/productos", label: "Productos", icon: "productos", adminOnly: true },
  { href: "/inventario", label: "Inventario", icon: "inventario", adminOnly: true },
  { href: "/empleados", label: "Empleados", icon: "empleados", adminOnly: true, needsPassword: true },
  { href: "/configuracion", label: "Configuración", icon: "configuracion", adminOnly: true, needsPassword: true },
];

export function visibleModules(isAdmin: boolean) {
  return NAV_MODULES.filter((mod) => !mod.adminOnly || isAdmin);
}

function splitHref(href: string) {
  const [path, query = ""] = href.split("?");
  return { path, params: new URLSearchParams(query) };
}

// ¿La URL actual cae dentro de este módulo? (/compras/conteos/abc → Compras)
export function isInModule(pathname: string | null, mod: NavModule) {
  if (!pathname) return false;
  return pathname === mod.href || pathname.startsWith(`${mod.href}/`);
}

// Sub-sección activa: la de prefijo de ruta más largo que coincida y, si
// la sub-sección lleva query (?view=X), que también coincida. Reportes sin
// ?view muestra su primera vista, así que se marca la primera.
export function activeChildHref(
  pathname: string | null,
  searchParams: URLSearchParams | null,
  children: NavChild[]
): string | null {
  if (!pathname) return null;
  let best: { href: string; length: number } | null = null;
  for (const child of children) {
    const { path, params } = splitHref(child.href);
    if (pathname !== path && !pathname.startsWith(`${path}/`)) continue;
    const queryMatches = [...params.entries()].every(([k, v]) => searchParams?.get(k) === v);
    if (!queryMatches) continue;
    if (!best || path.length > best.length) best = { href: child.href, length: path.length };
  }
  if (!best && children.length > 0) {
    const first = splitHref(children[0].href);
    const hasQuery = [...first.params.keys()].length > 0;
    const anyQueryPresent = [...first.params.keys()].some((k) => searchParams?.get(k));
    if (hasQuery && !anyQueryPresent && pathname === first.path) return children[0].href;
  }
  return best?.href ?? null;
}
