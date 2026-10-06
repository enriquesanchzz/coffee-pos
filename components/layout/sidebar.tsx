"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  Wallet,
  Package,
  BookOpen,
  Truck,
  BarChart3,
  Users,
  UserCog,
  Settings,
  LayoutDashboard,
  Tag,
  Percent,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Los 6 módulos definidos en el ADR / roadmap (ver docs/roadmap.md), más
// "Clientes" agregado en Fase 4 (no estaba en el ADR original de 6).
// needsPassword: además del rol, piden entrar con email y password (no
// basta el PIN) — se marca con un candado para que no sorprenda (QA-016).
// adminOnly: solo visibles para el rol ADMINISTRADOR — ver
// lib/session.ts resolveRoleName() y "cambios de administración" en
// docs/CONTINUE.md.
const modules = [
  { href: "/pos", label: "Punto de Venta", icon: ShoppingCart, enabled: true, adminOnly: false },
  { href: "/caja", label: "Caja", icon: Wallet, enabled: true, adminOnly: false },
  { href: "/administracion", label: "Administración", icon: LayoutDashboard, enabled: true, adminOnly: true, needsPassword: true },
  { href: "/clientes", label: "Clientes", icon: Users, enabled: true, adminOnly: true },
  { href: "/descuentos", label: "Códigos de descuento", icon: Tag, enabled: true, adminOnly: true },
  { href: "/promociones", label: "Promociones", icon: Percent, enabled: true, adminOnly: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, enabled: true, adminOnly: true },
  { href: "/compras", label: "Compras", icon: Truck, enabled: true, adminOnly: true },
  { href: "/productos", label: "Productos", icon: BookOpen, enabled: true, adminOnly: true },
  { href: "/inventario", label: "Inventario", icon: Package, enabled: true, adminOnly: true },
  { href: "/empleados", label: "Empleados", icon: UserCog, enabled: true, adminOnly: true, needsPassword: true },
  { href: "/configuracion", label: "Configuración", icon: Settings, enabled: true, adminOnly: true, needsPassword: true },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const visibleModules = modules.filter((mod) => !mod.adminOnly || isAdmin);

  return (
    // Por debajo de xl (tablets/celulares) se oculta: ocupa 224px que el POS
    // necesita para el catálogo, y el selector de zona de SessionBar ya
    // permite navegar entre módulos.
    <aside className="hidden h-full w-56 flex-shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/40 p-3 xl:flex">
      <div className="mb-4 px-3 py-1">
        <p className="text-sm font-semibold">Nomada Café</p>
        <p className="text-xs text-muted-foreground">POS</p>
      </div>

      <nav aria-label="Módulos" className="flex flex-1 flex-col gap-1">
        {visibleModules.map((mod, index) => {
          const Icon = mod.icon;
          const isActive = pathname === mod.href || pathname?.startsWith(`${mod.href}/`);
          const isFirstAdminItem = mod.adminOnly && !visibleModules[index - 1]?.adminOnly;
          return (
            <div key={mod.label}>
              {isFirstAdminItem && (
                <p className="mb-1 mt-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Administración
                </p>
              )}
              <Link
                href={mod.href}
                aria-disabled={!mod.enabled}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  !mod.enabled && "pointer-events-none text-muted-foreground",
                  mod.enabled && isActive && "bg-primary text-primary-foreground",
                  mod.enabled && !isActive && "text-foreground hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {mod.label}
                </span>
                {"needsPassword" in mod && mod.needsPassword && (
                  <Lock className="h-3.5 w-3.5 opacity-60" aria-label="Pide email y password" />
                )}
                {!mod.enabled && (
                  <Badge variant="outline" className="text-[10px]">
                    pronto
                  </Badge>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
