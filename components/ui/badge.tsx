import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "destructive" | "success" | "warning";

// success/warning: codificación de color consistente para estados de
// negocio (activo/óptimo en verde, alerta intermedia en ámbar) — antes
// "Activo" usaba el mismo color primario que cualquier botón de la UI,
// sin significado semántico propio.
const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-500 text-white",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
