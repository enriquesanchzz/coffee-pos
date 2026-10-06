import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada" };

// 404 en español (antes salía la página por defecto de Next en inglés).
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center">
      <p className="text-4xl font-bold" aria-hidden="true">404</p>
      <h1 className="text-lg font-semibold">Página no encontrada</h1>
      <p className="text-sm text-muted-foreground">No encontramos esta página o el registro ya no existe.</p>
      <Link href="/pos" className="text-sm font-medium underline">
        Volver al Punto de Venta
      </Link>
    </main>
  );
}
