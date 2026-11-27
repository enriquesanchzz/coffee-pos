"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allergenKey } from "@/lib/allergens";

// Lista de etiquetas cortas (alergias, ingredientes): se escribe una y se
// agrega con Enter, coma o al salir del campo; cada una se quita con su ×.
// Las sugerencias salen como autocompletado del navegador (datalist).
export function TagInput({
  id,
  label,
  value,
  onChange,
  suggestions = [],
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const taken = new Set(value.map(allergenKey));

  function commit(text: string) {
    const parts = text
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, " "))
      .filter(Boolean);
    const next = [...value];
    for (const part of parts) {
      if (!next.some((t) => allergenKey(t) === allergenKey(part))) next.push(part);
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={label}>
          {value.map((tag) => (
            <li
              key={allergenKey(tag)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-2.5 pr-1 text-xs"
            >
              {tag}
              <button
                type="button"
                aria-label={`Quitar ${tag}`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-background"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        list={listId}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          const text = e.target.value;
          if (text.includes(",")) commit(text);
          else setDraft(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !taken.has(allergenKey(s)))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
