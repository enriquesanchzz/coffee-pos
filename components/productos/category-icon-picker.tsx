"use client";

import {
  Coffee,
  Snowflake,
  Cake,
  ShoppingBag,
  Gift,
  IceCreamCone,
  Sandwich,
  CupSoda,
  Cookie,
  Croissant,
  Milk,
  Candy,
  Soup,
  Beef,
  Wine,
  Package,
  type LucideIcon,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Lista curada — Prisma solo guarda el nombre como string
// (ProductCategory.icon), validado contra esta lista, no un ícono libre.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Coffee,
  Snowflake,
  Cake,
  ShoppingBag,
  Gift,
  IceCreamCone,
  Sandwich,
  CupSoda,
  Cookie,
  Croissant,
  Milk,
  Candy,
  Soup,
  Beef,
  Wine,
  Package,
};

export function CategoryIcon({ icon, className }: { icon: string | null; className?: string }) {
  const Icon = icon ? CATEGORY_ICONS[icon] : undefined;
  if (!Icon) return null;
  return <Icon className={className} />;
}

export function CategoryIconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>Ícono (opcional)</Label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border border-border text-xs text-muted-foreground",
            value === null ? "border-primary bg-primary/10" : "hover:bg-muted"
          )}
          title="Sin ícono"
        >
          —
        </button>
        {Object.entries(CATEGORY_ICONS).map(([name, Icon]) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md border border-border",
              value === name ? "border-primary bg-primary/10" : "hover:bg-muted"
            )}
            title={name}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
