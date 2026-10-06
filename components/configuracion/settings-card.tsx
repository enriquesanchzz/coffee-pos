"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Tarjeta común de las secciones de Configuración: título, campos, botón
// Guardar, "Restaurar valores originales" (opcional) y el mensaje de
// resultado. Cada formulario solo arma sus campos y su función de guardado.
export function SettingsCard({
  title,
  description,
  onSave,
  onReset,
  saveDisabled,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  // Lanza Error con el mensaje para el usuario si no se pudo guardar.
  onSave: () => Promise<void>;
  onReset?: () => Promise<void>;
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(task: () => Promise<void>, okMessage: string) {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        await task();
        setSaved(okMessage);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la configuración.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        {error && <Alert variant="error">{error}</Alert>}
        {saved && !error && <Alert variant="success">{saved}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => run(onSave, "Guardado.")} disabled={isPending || saveDisabled}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
          {onReset && (
            <Button type="button" variant="ghost" onClick={() => setConfirmReset(true)} disabled={isPending}>
              Restaurar valores originales
            </Button>
          )}
        </div>
      </CardContent>
      {onReset && (
        <ConfirmDialog
          open={confirmReset}
          title="Restaurar valores originales"
          message="Esta sección vuelve a los valores con los que viene el sistema."
          confirmLabel="Restaurar"
          onConfirm={() => {
            setConfirmReset(false);
            run(onReset, "Se restauraron los valores originales.");
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </Card>
  );
}

// "10, 15, 20" -> [10, 15, 20]; regresa null si algo no es un entero > 0.
export function parseIntList(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return numbers;
}

// useState que se vuelve a sincronizar cuando cambia el valor guardado
// (ej. después de "Restaurar valores originales" y router.refresh()), sin
// volver a montar el formulario — así no se pierde el mensaje de resultado.
export function useSyncedState<T>(saved: T) {
  const [value, setValue] = useState(saved);
  const key = JSON.stringify(saved);
  useEffect(() => {
    setValue(JSON.parse(key) as T);
  }, [key]);
  return [value, setValue] as const;
}
