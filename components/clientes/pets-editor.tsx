"use client";

import { useEffect, useState, useTransition } from "react";
import type { PetSpecies } from "@prisma/client";
import { PawPrint, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/ui/image-upload";
import { TagInput } from "@/components/ui/tag-input";
import { useToast } from "@/components/ui/toast";
import { savePet as savePetAction, deletePet as deletePetAction } from "@/actions/pets";
import { withActionErrors } from "@/lib/action-result";
import { COMMON_ALLERGENS } from "@/lib/allergens";
import { isBirthdayOn } from "@/lib/birthday-dates";
import { zonedDateKey } from "@/lib/time";
import type { CustomerPet } from "@/lib/customers";
import { cn } from "@/lib/utils";

const savePet = withActionErrors(savePetAction);
const deletePet = withActionErrors(deletePetAction);

export const SPECIES_LABELS: Record<PetSpecies, string> = { PERRO: "Perro", GATO: "Gato", OTRO: "Otro" };
const SPECIES: PetSpecies[] = ["PERRO", "GATO", "OTRO"];

type Draft = {
  id?: string;
  name: string;
  species: PetSpecies;
  breed: string;
  weightKg: string;
  birthDate: string;
  photoUrl: string;
  allergies: string[];
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  species: "PERRO",
  breed: "",
  weightKg: "",
  birthDate: "",
  photoUrl: "",
  allergies: [],
  notes: "",
};

function toDraft(pet: CustomerPet): Draft {
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? "",
    weightKg: pet.weightKg !== null ? String(pet.weightKg) : "",
    birthDate: pet.birthDate ?? "",
    photoUrl: pet.photoUrl ?? "",
    allergies: pet.allergies,
    notes: pet.notes ?? "",
  };
}

function formatBirthDate(key: string) {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

// Mascotas de un cliente: lista + alta/edición en el mismo lugar. Lo usan
// el perfil del cliente (/clientes/[id]) y el POS (diálogo "Mascotas").
export function PetsEditor({
  employeeId,
  customerId,
  pets: initialPets,
  onPetsChange,
  allergenSuggestions = [],
}: {
  employeeId: string;
  customerId: string;
  pets: CustomerPet[];
  onPetsChange?: (pets: CustomerPet[]) => void;
  allergenSuggestions?: string[];
}) {
  const [pets, setPets] = useState(initialPets);
  // El mismo editor puede quedar montado al cambiar de cliente (POS).
  useEffect(() => {
    setPets(initialPets);
  }, [initialPets]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const notify = useToast();
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => setTodayKey(zonedDateKey(new Date())), []);

  const suggestions = Array.from(new Set([...COMMON_ALLERGENS, ...allergenSuggestions]));

  function applyPets(next: CustomerPet[]) {
    setPets(next);
    onPetsChange?.(next);
  }

  function open(next: Draft) {
    setError(null);
    setConfirmDeleteId(null);
    setDraft(next);
  }

  function handleSave() {
    if (!draft) return;
    setError(null);
    if (!draft.name.trim()) {
      setError("El nombre de la mascota es obligatorio.");
      return;
    }
    const weight = draft.weightKg.trim() === "" ? null : Number(draft.weightKg.replace(",", "."));
    startTransition(async () => {
      try {
        const next = await savePet({
          employeeId,
          customerId,
          petId: draft.id,
          name: draft.name,
          species: draft.species,
          breed: draft.breed,
          weightKg: weight === null ? null : Number.isFinite(weight) ? weight : NaN,
          birthDate: draft.birthDate || null,
          photoUrl: draft.photoUrl,
          allergies: draft.allergies,
          notes: draft.notes,
        });
        applyPets(next);
        notify(draft.id ? `${draft.name.trim()} actualizado.` : `${draft.name.trim()} agregado.`);
        setDraft(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la mascota.");
      }
    });
  }

  function handleDelete(pet: CustomerPet) {
    setError(null);
    startTransition(async () => {
      try {
        applyPets(await deletePet({ employeeId, customerId, petId: pet.id }));
        notify(`${pet.name} eliminado.`);
        setConfirmDeleteId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo eliminar la mascota.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {pets.length === 0 && !draft && <p className="text-sm text-muted-foreground">Sin mascotas registradas.</p>}

      <ul className="flex flex-col gap-2">
        {pets.map((pet) =>
          draft?.id === pet.id ? null : (
            <li key={pet.id} className="flex gap-3 rounded-md border border-border p-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {pet.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pet.photoUrl} alt={pet.name} className="h-full w-full object-cover" />
                ) : (
                  <PawPrint className="h-5 w-5 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                <p className="font-medium">
                  {pet.name}
                  {todayKey && isBirthdayOn(pet.birthDate, todayKey) && <span> · 🎂 ¡cumple hoy!</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    SPECIES_LABELS[pet.species],
                    pet.breed,
                    pet.weightKg !== null ? `${pet.weightKg} kg` : null,
                    pet.birthDate ? `cumple ${formatBirthDate(pet.birthDate)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {pet.allergies.length > 0 && (
                  <p className="text-xs">
                    <span className="font-medium text-warning">Alergias:</span> {pet.allergies.join(", ")}
                  </p>
                )}
                {pet.notes && <p className="break-words text-xs italic text-muted-foreground">{pet.notes}</p>}
                {confirmDeleteId === pet.id && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs">¿Eliminar a {pet.name}?</span>
                    <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => handleDelete(pet)}>
                      Sí, eliminar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                      No
                    </Button>
                  </div>
                )}
              </div>
              {confirmDeleteId !== pet.id && (
                <div className="flex shrink-0 flex-col gap-1">
                  <Button type="button" size="sm" variant="outline" aria-label={`Editar a ${pet.name}`} onClick={() => open(toDraft(pet))}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Eliminar a ${pet.name}`}
                    onClick={() => {
                      setDraft(null);
                      setConfirmDeleteId(pet.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          )
        )}
      </ul>

      {draft ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <p className="text-sm font-medium">{draft.id ? `Editar a ${draft.name || "la mascota"}` : "Mascota nueva"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pet-name">Nombre</Label>
              <Input id="pet-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label id="pet-species">Especie</Label>
              <div role="radiogroup" aria-labelledby="pet-species" className="flex gap-2">
                {SPECIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={draft.species === s}
                    onClick={() => setDraft({ ...draft, species: s })}
                    className={cn(
                      "min-h-10 flex-1 rounded-md border px-2 text-sm",
                      draft.species === s ? "border-primary bg-primary/10" : "border-input hover:bg-muted"
                    )}
                  >
                    {SPECIES_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pet-breed">Raza (opcional)</Label>
              <Input id="pet-breed" value={draft.breed} onChange={(e) => setDraft({ ...draft, breed: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pet-weight">Peso en kg (opcional)</Label>
              <Input
                id="pet-weight"
                inputMode="decimal"
                value={draft.weightKg}
                onChange={(e) => setDraft({ ...draft, weightKg: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pet-birthday">Cumpleaños (opcional)</Label>
              <Input
                id="pet-birthday"
                type="date"
                value={draft.birthDate}
                max={todayKey ?? undefined}
                onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
              />
            </div>
          </div>
          <TagInput
            id="pet-allergies"
            label="Alergias o restricciones (opcional)"
            value={draft.allergies}
            onChange={(allergies) => setDraft({ ...draft, allergies })}
            suggestions={suggestions}
            placeholder="ej. pollo — Enter para agregar"
            hint="Caja avisa si se agrega un producto que las contiene. Usa las mismas palabras que en los productos."
          />
          <ImageUpload id="pet-photo" label="Foto (opcional)" value={draft.photoUrl} onChange={(photoUrl) => setDraft({ ...draft, photoUrl })} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="pet-notes">Notas (opcional)</Label>
            <Input id="pet-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar mascota"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => open(EMPTY_DRAFT)} className="self-start">
            <PawPrint className="h-4 w-4" aria-hidden />
            Agregar mascota
          </Button>
        </>
      )}
    </div>
  );
}
