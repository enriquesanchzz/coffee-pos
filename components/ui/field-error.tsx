import { cn } from "@/lib/utils";

// Error de UN campo, justo debajo de él (auditoría MF-2). En 14 px como
// cualquier error; para errores de una acción completa, usar
// <Alert variant="error">. Ligarlo al campo con aria-describedby={id}.
export function FieldError({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={cn("mt-1 text-sm text-destructive", className)}>
      {children}
    </p>
  );
}
