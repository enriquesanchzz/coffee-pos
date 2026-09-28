"use client";

import { useEffect, useState, useTransition } from "react";
import type { IngredientCategoryOption } from "@/lib/inventory";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryIconPicker } from "@/components/productos/category-icon-picker";
import {
  createIngredientCategory,
  updateIngredientCategory,
  deleteIngredientCategory,
} from "@/actions/inventory";

export function CategoryFormDialog({
  open,
  category,
  employeeId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  category: IngredientCategoryOption | null;
  employeeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(category);
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Mismo motivo que IngredientFormDialog: este diálogo queda montado de
  // forma permanente con `open`/`category` cambiando por prop, así que hay
  // que resincronizar los campos con un efecto en vez de confiar en el
  // valor inicial de useState (que solo se evalúa una vez, al montar).
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? null);
    setError(null);
    setConfirmingDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && category) {
          await updateIngredientCategory({
            employeeId,
            categoryId: category.id,
            name,
            icon: icon || undefined,
          });
        } else {
          await createIngredientCategory({ employeeId, name, icon: icon || undefined });
        }
        onSaved();
        handleOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la categoría.");
      }
    });
  }

  function handleDelete() {
    if (!category) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteIngredientCategory({ employeeId, categoryId: category.id });
        onSaved();
        handleOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo borrar la categoría.");
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={isEdit ? "Editar categoría" : "Nueva categoría"}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="category-name">Nombre</Label>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej. Endulzantes"
          />
        </div>

        <CategoryIconPicker value={icon} onChange={setIcon} />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={isPending} className="flex-1">
            {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear categoría"}
          </Button>
          {isEdit &&
            (confirmingDelete ? (
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                ¿Borrar?
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setConfirmingDelete(true)} disabled={isPending}>
                Borrar
              </Button>
            ))}
        </div>
      </div>
    </Dialog>
  );
}
