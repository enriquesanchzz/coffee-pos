import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getStatsReport } from "@/lib/reports";
import { getOpenShift } from "@/lib/catalog";
import { getInventoryOverview } from "@/lib/inventory";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

// Accesos rápidos — Empleados y Configuración ya viven en sus propias
// rutas (ver Sidebar); Descuentos/Promociones se agregan aquí cuando
// existan sus rutas (Frentes C/D de la reestructuración).
const adminSections = [
  { href: "/clientes", label: "Clientes", description: "Alta, edición y top de compras." },
  { href: "/descuentos", label: "Códigos de descuento", description: "Para clientes, campañas y empleados." },
  { href: "/promociones", label: "Promociones", description: "Paquetes, 2x1 y días temáticos." },
  { href: "/reportes", label: "Reportes", description: "Utilidad, recetas, inventario y estadísticas." },
  { href: "/compras", label: "Compras", description: "Órdenes de compra y proveedores." },
  { href: "/productos", label: "Productos", description: "Catálogo, recetas y variantes." },
  { href: "/inventario", label: "Inventario", description: "Insumos, categorías y stock." },
  { href: "/empleados", label: "Empleados", description: "Roles y acceso." },
  { href: "/configuracion", label: "Configuración", description: "Apariencia y ajustes del sistema." },
];

export default async function AdministracionPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [todayStats, shift, inventory] = await Promise.all([
    getStatsReport(startOfDay, endOfDay),
    getOpenShift(DEFAULT_BRANCH_ID),
    getInventoryOverview(),
  ]);

  const lowStockItems = inventory.filter((item) => item.isLow);

  return (
    <AuthenticatedShell isAdmin employeeName={actor.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Administración</h1>
          <p className="text-sm text-muted-foreground">Resumen del día y accesos rápidos.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ventas de hoy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(todayStats.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">
                {todayStats.totalSales} venta{todayStats.totalSales === 1 ? "" : "s"} · ticket prom.{" "}
                {formatCurrency(todayStats.averageTicket)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Turno de caja</CardTitle>
            </CardHeader>
            <CardContent>
              {shift ? (
                <>
                  <p className="flex items-center gap-2 text-2xl font-semibold">
                    Abierto
                    <Badge variant="outline" className="text-[10px]">
                      {shift.type}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    desde las{" "}
                    {new Date(shift.openedAt).toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold">Cerrado</p>
                  <p className="text-xs text-muted-foreground">No hay turno abierto.</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Stock bajo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{lowStockItems.length}</p>
              <p className="text-xs text-muted-foreground">
                {lowStockItems.length === 0
                  ? "Todo el inventario está en orden."
                  : "insumo" + (lowStockItems.length === 1 ? "" : "s") + " por debajo del mínimo"}
              </p>
            </CardContent>
          </Card>
        </div>

        {lowStockItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Insumos con stock bajo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span>{item.name}</span>
                    <Badge variant="destructive" className="text-[10px]">
                      stock bajo
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Intl.NumberFormat("es-MX").format(item.quantity)} {item.baseUnit}
                    </span>
                    <Link href="/compras/nueva" className="text-sm text-primary hover:underline">
                      Pedir →
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {adminSections.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  className="rounded-lg border p-4 text-sm hover:bg-accent"
                >
                  <p className="font-medium">{section.label}</p>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
