"use client";

import { cn } from "@/lib/utils";

// Selector de una opción entre pocas (tipo de orden, tamaño, método de
// pago…) con UN solo estilo de "seleccionado" en todo el POS (auditoría
// UI/UX UI-01/MF-2): tinte primary/10 + contorno de 2 px. El contorno es
// borde de 1 px + ring de 1 px, para que elegir una opción no mueva nada.
//
// Botones con aria-pressed dentro de un role="group" — patrón de botones
// de alternancia de ARIA; las pruebas los encuentran por rol "button".
export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  // Nombre accesible si `label` no es texto (ej. ícono + texto).
  ariaLabel?: string;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  // Nombre del grupo para lectores de pantalla ("Tipo de orden").
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  // "md" = 44 px (POS táctil), "lg" = 48 px.
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => (
        <SegmentedButton
          key={option.value}
          selected={value === option.value}
          disabled={option.disabled}
          aria-label={option.ariaLabel}
          size={size}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </SegmentedButton>
      ))}
    </div>
  );
}

// El botón suelto, para selectores que no caben en SegmentedControl (ej.
// cupones del cliente, que además muestran un monto).
export function SegmentedButton({
  selected,
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "lg" ? "min-h-12" : "min-h-11",
        selected
          ? "border-primary bg-primary/10 font-semibold text-foreground ring-1 ring-inset ring-primary dark:bg-primary/20"
          : "border-border bg-background hover:bg-muted",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
