import * as React from "react";
import { cn } from "@/lib/utils";

// Una Card con onClick (tarjetas de producto, categoría, código...) se
// comporta como botón: se puede enfocar con Tab y activar con Enter/Espacio
// — antes era un <div> que solo respondía al mouse/touch.
export function Card({ className, onClick, onKeyDown, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const interactive = Boolean(onClick);
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background shadow-sm",
        interactive &&
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      // Solo con onClick: Card también se usa en Server Components, que no
      // pueden llevar handlers.
      onKeyDown={
        interactive
          ? (e) => {
              onKeyDown?.(e);
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                e.currentTarget.click();
              }
            }
          : onKeyDown
      }
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-2", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-4 pt-2", className)} {...props} />;
}
