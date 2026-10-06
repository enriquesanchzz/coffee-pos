"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";

export type ComboboxOption = {
  value: string;
  label: string;
  // Texto secundario (ej. "· shot · $11.67", teléfono del cliente).
  description?: string;
  // Texto extra que también se busca pero no se muestra.
  keywords?: string;
};

// Selector con búsqueda que sigue el patrón ARIA 1.2 "combobox con
// listbox" (A11Y-03, QA-017): se escribe para filtrar, ↑/↓ mueven la opción
// activa, Enter la elige, Esc cierra. Reemplaza los <select> de 150+
// opciones y los buscadores que solo funcionaban con el mouse.
//
// Dos usos:
//   - Selector: `value` es el valor elegido y el input muestra su etiqueta
//     cuando no tiene foco.
//   - Buscador (clientes, extras): `value` null y se escucha
//     `onQueryChange`; `action` agrega una opción final (ej. "Crear X").
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder,
  emptyText = "Sin resultados.",
  onQueryChange,
  action,
  className,
  inputClassName,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  disabled,
}: {
  id?: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  onQueryChange?: (query: string) => void;
  action?: { label: (query: string) => string; onSelect: (query: string) => void; showWhen?: (query: string) => boolean };
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  disabled?: boolean;
}) {
  const generatedId = React.useId();
  const inputId = id ?? `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = value ? options.find((o) => o.value === value) ?? null : null;
  const filtered = query.trim()
    ? options.filter((o) => matchesSearch(query, o.label, o.description, o.keywords))
    : options;
  const showAction = Boolean(action && query.trim() && (action.showWhen ? action.showWhen(query) : true));
  const itemCount = filtered.length + (showAction ? 1 : 0);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  React.useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function updateQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }

  function choose(index: number) {
    if (index < filtered.length) {
      onChange(filtered[index].value);
      updateQuery("");
      setOpen(false);
    } else if (showAction && action) {
      action.onSelect(query.trim());
      setOpen(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActiveIndex((i) => Math.min(i + 1, itemCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && itemCount > 0) {
        e.preventDefault();
        choose(activeIndex);
      }
    } else if (e.key === "Escape") {
      if (open) {
        // Que el Esc cierre la lista, no el diálogo que la contiene.
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        setOpen(false);
      }
    }
  }

  const activeId = open && itemCount > 0 ? `${listboxId}-opt-${activeIndex}` : undefined;
  const displayValue = open || !selected ? query : selected.label;

  return (
    <div className={cn("relative", className)}>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={selected && !open ? selected.label : placeholder}
        onChange={(e) => {
          updateQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-10 w-full rounded-md border border-border bg-background py-2 pl-3 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
          inputClassName
        )}
      />
      <ChevronsUpDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-background py-1 shadow-md"
        >
          {filtered.length === 0 && !showAction && (
            <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
          )}
          {filtered.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listboxId}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                  index === activeIndex && "bg-muted"
                )}
              >
                <Check aria-hidden="true" className={cn("h-4 w-4 flex-shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1 break-words">
                  {option.label}
                  {option.description && <span className="text-muted-foreground"> {option.description}</span>}
                </span>
              </li>
            );
          })}
          {showAction && action && (
            <li
              id={`${listboxId}-opt-${filtered.length}`}
              data-index={filtered.length}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(filtered.length)}
              onClick={() => choose(filtered.length)}
              className={cn(
                "cursor-pointer border-t border-border px-3 py-2 text-sm font-medium text-primary",
                activeIndex === filtered.length && "bg-muted"
              )}
            >
              {action.label(query.trim())}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
