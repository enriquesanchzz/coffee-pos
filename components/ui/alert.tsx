import { cn } from "@/lib/utils";

const VARIANTS = {
  error: "border-destructive/50 bg-destructive/10 text-destructive",
  success: "border-success/40 bg-success-muted text-success",
  info: "border-border bg-muted/40 text-muted-foreground",
  // Aviso que pide atención sin ser un error (ej. alergia de una mascota).
  warning: "border-warning/50 bg-warning-muted text-foreground",
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
      role={variant === "error" || variant === "warning" ? "alert" : "status"}
      className={cn("rounded-md border px-3 py-2 text-sm", VARIANTS[variant], className)}
    >
      {children}
    </div>
  );
}
