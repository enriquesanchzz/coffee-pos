import Link from "next/link";
import {
  ShoppingCart,
  Wallet,
  Package,
  BookOpen,
  Truck,
  BarChart3,
  Users,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Los 6 módulos definidos en el ADR / roadmap (ver docs/roadmap.md), más
// "Clientes" agregado en Fase 4 (no estaba en el ADR original de 6).
const modules = [
  { href: "/pos", label: "Punto de Venta", icon: ShoppingCart, enabled: true },
  { href: "/caja", label: "Caja", icon: Wallet, enabled: true },
  { href: "/inventario", label: "Inventario", icon: Package, enabled: true },
  { href: "/productos", label: "Productos", icon: BookOpen, enabled: true },
  { href: "/compras", label: "Compras", icon: Truck, enabled: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, enabled: true },
  { href: "/clientes", label: "Clientes", icon: Users, enabled: true },
  { href: "/administracion", label: "Administración", icon: Settings, enabled: true },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-muted/40 p-3">
      <div className="mb-4 px-2 py-1">
        <p className="text-sm font-semibold">Nomada Café</p>
        <p className="text-xs text-muted-foreground">POS</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.label}
              href={mod.href}
              aria-disabled={!mod.enabled}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors",
                mod.enabled
                  ? "hover:bg-muted text-foreground"
                  : "pointer-events-none text-muted-foreground"
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {mod.label}
              </span>
              {!mod.enabled && (
                <Badge variant="outline" className="text-[10px]">
                  pronto
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
