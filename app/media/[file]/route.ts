import type { NextRequest } from "next/server";
import { readStoredImage } from "@/lib/uploads";

// Sirve las fotos guardadas por /api/uploads. Sin sesión a propósito: el
// logo sale en tickets y la tarjeta de lealtad pública (/lealtad/[code]) y
// los nombres son UUID aleatorios, no adivinables. Cada archivo es
// inmutable (una foto nueva = un nombre nuevo), así que se cachea para
// siempre en la tablet.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const data = await readStoredImage(file);
  if (!data) return new Response("No encontrada", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
