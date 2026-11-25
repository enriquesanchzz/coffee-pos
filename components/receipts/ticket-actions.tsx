"use client";

import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// Botones de la página de ticket — ocultos al imprimir (print:hidden) para
// que solo salga el ticket. window.print() basta: cualquier impresora
// (térmica de 80mm incluida) ya la maneja el diálogo del navegador, no
// hace falta integrar una impresora en particular.
export function TicketActions({ backHref }: { backHref: string }) {
  return (
    <div className="mx-auto flex max-w-xs justify-between gap-2 p-4 print:hidden">
      <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Volver
      </Link>
      <Button onClick={() => window.print()}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        Imprimir
      </Button>
    </div>
  );
}
