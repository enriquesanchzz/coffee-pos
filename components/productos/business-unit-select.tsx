"use client";

import type { BusinessUnit } from "@prisma/client";
import { Label } from "@/components/ui/label";
import { BUSINESS_UNITS, BUSINESS_UNIT_LABELS } from "@/lib/business-unit";
import { cn } from "@/lib/utils";

// Cafetería / Pet Shop como dos botones (un toque en tablet), no un select.
export function BusinessUnitSelect({
  id,
  value,
  onChange,
  hint,
}: {
  id: string;
  value: BusinessUnit;
  onChange: (unit: BusinessUnit) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label id={id}>Negocio</Label>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 gap-2">
        {BUSINESS_UNITS.map((unit) => (
          <button
            key={unit}
            type="button"
            role="radio"
            aria-checked={value === unit}
            onClick={() => onChange(unit)}
            className={cn(
              "min-h-11 rounded-md border px-3 text-sm font-medium transition-colors",
              value === unit ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted"
            )}
          >
            {BUSINESS_UNIT_LABELS[unit]}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
