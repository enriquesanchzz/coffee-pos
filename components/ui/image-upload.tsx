"use client";

import { useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Campo de foto: sube a /api/uploads (lib/uploads.ts) y entrega la URL
// /media/… resultante vía onChange. La foto se guarda en la Mac al
// elegirla; el registro (producto, logo…) se actualiza cuando la persona
// guarda el formulario, igual que el resto de los campos.
export function ImageUpload({
  id,
  label,
  value,
  onChange,
  hint,
  fit = "cover",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  // "contain" para logos (no recortar), "cover" para fotos.
  fit?: "cover" | "contain";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const notify = useToast();

  async function handleFile(file: File) {
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "No se pudo subir la imagen.");
      onChange(data.url);
    } catch (err) {
      notify(
        err instanceof TypeError ? "Sin conexión con el servidor — intenta de nuevo." : err instanceof Error ? err.message : "No se pudo subir la imagen.",
        "error"
      );
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className={cn("h-full w-full", fit === "contain" ? "object-contain p-1" : "object-cover")} />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isUploading} onClick={() => inputRef.current?.click()}>
            {isUploading ? "Subiendo..." : value ? "Cambiar foto" : "Subir foto"}
          </Button>
          {value && !isUploading && (
            <Button type="button" variant="ghost" onClick={() => onChange("")}>
              Quitar
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
