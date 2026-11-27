"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReminderAction } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { recordReminder as recordReminderAction } from "@/actions/reminders";
import { withActionErrors } from "@/lib/action-result";
import type { DueReminder } from "@/lib/reminders";

const recordReminder = withActionErrors(recordReminderAction);

function ago(days: number) {
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

// Lista de recordatorios pendientes de un tipo. Al abrir el WhatsApp (o al
// omitirlo) se marca como atendido y desaparece de la lista; vuelve a salir
// solo si el cliente compra otra vez.
export function ReminderList({ reminders, emptyText }: { reminders: DueReminder[]; emptyText: string }) {
  const router = useRouter();
  const notify = useToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function mark(r: DueReminder, action: ReminderAction) {
    setError(null);
    setHidden((prev) => new Set(prev).add(r.key));
    startTransition(async () => {
      try {
        await recordReminder({
          customerId: r.customerId,
          kind: r.kind,
          productIds: r.products.map((p) => p.id),
          action,
        });
        if (action === "OMITIDO") notify(`Recordatorio de ${r.customerName} omitido.`);
        router.refresh();
      } catch (err) {
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(r.key);
          return next;
        });
        setError(err instanceof Error ? err.message : "No se pudo guardar el recordatorio.");
      }
    });
  }

  const visible = reminders.filter((r) => !hidden.has(r.key));

  return (
    <div className="flex flex-col divide-y">
      {error && <Alert variant="error">{error}</Alert>}
      {visible.length === 0 && <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>}
      {visible.map((r) => (
        <div key={r.key} className="flex flex-col gap-2 py-3 text-sm" data-testid="reminder-row">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                <Link href={`/clientes/${r.customerId}`} className="hover:underline">
                  {r.customerName}
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                {r.kind === "CAFE_TE_EXTRANAMOS"
                  ? `Última compra de Cafetería ${ago(r.daysSince)}`
                  : r.products.map((p) => `${p.name} (${ago(p.daysSince)})`).join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => mark(r, "OMITIDO")}>
                Omitir
              </Button>
              {r.whatsAppHref ? (
                <a
                  href={r.whatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => mark(r, "ENVIADO")}
                  className={buttonVariants({ variant: "outline", size: "sm", className: "h-9" })}
                >
                  Enviar por WhatsApp
                </a>
              ) : (
                <span className="self-center text-xs text-muted-foreground">Sin teléfono</span>
              )}
            </div>
          </div>
          <p className="whitespace-pre-line rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{r.message}</p>
        </div>
      ))}
    </div>
  );
}
