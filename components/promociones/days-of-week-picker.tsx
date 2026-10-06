"use client";

import { cn } from "@/lib/utils";

const DAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

// Selector de días de la semana — vacío significa "todos los días"
// (ver Combo.daysOfWeek/Promotion.daysOfWeek en el schema), así que no
// hay un estado "inválido": 0 días marcados ya es un valor legítimo.
export function DaysOfWeekPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  function toggle(day: number) {
    if (value.includes(day)) {
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day].sort());
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {DAY_LABELS.map((label, day) => (
          <button
            aria-pressed={value.includes(day)}
            key={day}
            type="button"
            onClick={() => toggle(day)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border border-border text-xs font-medium transition-colors",
              value.includes(day) ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length === 0 ? "Todos los días" : "Solo los días marcados"}
      </p>
    </div>
  );
}
