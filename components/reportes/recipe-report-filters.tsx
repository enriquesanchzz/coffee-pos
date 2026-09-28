"use client";

import { useRouter, usePathname } from "next/navigation";
import type { ProductCategoryOption } from "@/lib/recipes";
import { Select } from "@/components/ui/select";

const TEMPERATURE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "CALIENTE", label: "Caliente" },
  { value: "FRIO", label: "Fría" },
  { value: "FRAPPE", label: "Frappé" },
];

export function RecipeReportFilters({
  categories,
  categoryId,
  temperature,
}: {
  categories: ProductCategoryOption[];
  categoryId: string;
  temperature: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function updateParam(key: "category" | "temperature", value: string) {
    const params = new URLSearchParams({ category: categoryId, temperature });
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium leading-none" htmlFor="category-filter">
          Categoría
        </label>
        <Select
          id="category-filter"
          value={categoryId}
          onChange={(e) => updateParam("category", e.target.value)}
          className="w-44"
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentName ? `${c.parentName} — ${c.name}` : c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium leading-none" htmlFor="temperature-filter">
          Temperatura
        </label>
        <Select
          id="temperature-filter"
          value={temperature}
          onChange={(e) => updateParam("temperature", e.target.value)}
          className="w-36"
        >
          {TEMPERATURE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
