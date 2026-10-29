import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getShiftTicketData } from "@/lib/receipt";
import { getBusinessSettings } from "@/lib/settings";
import { formatCurrency } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { TicketPaper, TicketDivider, TicketRow } from "@/components/receipts/ticket-paper";
import { TicketActions } from "@/components/receipts/ticket-actions";

export const metadata: Metadata = { title: "Comprobante de apertura" };

const SHIFT_TYPE_LABELS: Record<string, string> = { MATUTINO: "Matutino", VESPERTINO: "Vespertino" };

export default async function ShiftOpeningTicketPage({ params }: { params: Promise<{ shiftId: string }> }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const { shiftId } = await params;
  const [shift, settings] = await Promise.all([getShiftTicketData(shiftId), getBusinessSettings()]);

  return (
    <div className="min-h-screen bg-muted/30 py-6">
      <TicketActions backHref="/pos" />
      <TicketPaper>
        <div className="text-center">
          <p className="text-sm font-bold">{settings.businessName}</p>
          <p className="mt-1 font-bold">Apertura de turno</p>
        </div>
        <TicketDivider />
        <p>{formatDateTime(shift.openedAt)}</p>
        <p>Turno: {SHIFT_TYPE_LABELS[shift.type] ?? shift.type}</p>
        <p>Cajero: {shift.cashierName}</p>
        {shift.openingConfirmedByName && <p>Autorizó: {shift.openingConfirmedByName}</p>}
        <TicketDivider />
        <TicketRow label="Fondo de caja inicial" value={formatCurrency(shift.openingCash)} bold />
        <TicketDivider />
        <p className="text-center text-[11px] text-muted-foreground">Folio de turno: {shift.id.slice(-8).toUpperCase()}</p>
      </TicketPaper>
    </div>
  );
}
