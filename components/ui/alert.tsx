import { cn } from "@/lib/utils";

const VARIANTS = {
  error: "border-destructive/50 bg-destructive/10 text-destructive",
  success: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  info: "border-border bg-muted/40 text-muted-foreground",
} as const;

// Mensaje único para errores, confirmaciones y avisos (E11). Los errores
// se anuncian de inmediato (role=alert); éxito e info, de forma educada
// (role=status) para no interrumpir al lector de pantalla.
export function Alert({
  variant = "info",
  className,
  children,
}: {
  variant?: keyof typeof VARIANTS;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-3 py-2 text-sm", VARIANTS[variant], className)}
    >
      {children}
    </div>
  );
}
