import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getShiftTicketData } from "@/lib/receipt";
import { getBusinessSettings } from "@/lib/settings";
import { formatCurrency } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { TicketPaper, TicketDivider, TicketRow } from "@/components/receipts/ticket-paper";
import { TicketActions } from "@/components/receipts/ticket-actions";

export const metadata: Metadata = { title: "Corte de caja" };

const SHIFT_TYPE_LABELS: Record<string, string> = { MATUTINO: "Matutino", VESPERTINO: "Vespertino" };

export default async function ShiftClosingTicketPage({ params }: { params: Promise<{ shiftId: string }> }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const { shiftId } = await params;
  const [shift, settings] = await Promise.all([getShiftTicketData(shiftId), getBusinessSettings()]);

  if (shift.status !== "CERRADO" || shift.closedAt === null) {
    return (
      <div className="min-h-screen bg-muted/30 py-6">
        <TicketActions backHref="/caja" />
        <TicketPaper>
          <p className="text-center">Este turno todavía no se cierra — no hay corte que imprimir.</p>
        </TicketPaper>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6">
      <TicketActions backHref="/caja" />
      <TicketPaper>
        <div className="text-center">
          <p className="text-sm font-bold">{settings.businessName}</p>
          <p className="mt-1 font-bold">Corte de caja</p>
        </div>
        <TicketDivider />
        <p>Apertura: {formatDateTime(shift.openedAt)}</p>
        <p>Cierre: {formatDateTime(shift.closedAt)}</p>
        <p>Turno: {SHIFT_TYPE_LABELS[shift.type] ?? shift.type}</p>
        <p>Cajero: {shift.cashierName}</p>
        {shift.closingConfirmedByName && <p>Autorizó: {shift.closingConfirmedByName}</p>}
        <TicketDivider />
        <TicketRow label="Fondo inicial" value={formatCurrency(shift.openingCash)} />
        <TicketRow label="Total de ventas" value={formatCurrency(shift.salesTotal)} bold />
        <TicketRow label="Propinas" value={formatCurrency(shift.tipsTotal)} />
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide">Cobrado por tipo (incluye propinas)</p>
        <TicketRow label="Efectivo" value={formatCurrency(shift.paymentsByMethod.EFECTIVO)} />
        <TicketRow label="Tarjeta" value={formatCurrency(shift.paymentsByMethod.TARJETA)} />
        <TicketRow label="Transferencia" value={formatCurrency(shift.paymentsByMethod.TRANSFERENCIA)} />
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide">Efectivo en caja</p>
        <TicketRow label="Retiros" value={shift.retirosTotal > 0 ? `-${formatCurrency(shift.retirosTotal)}` : formatCurrency(0)} />
        <TicketRow label="Ingresos" value={formatCurrency(shift.ingresosTotal)} />
        <TicketRow label="Efectivo esperado" value={formatCurrency(shift.expectedCash ?? 0)} bold />
        <TicketRow label="Efectivo contado" value={formatCurrency(shift.closingCash ?? 0)} bold />
        <TicketRow label="Diferencia" value={formatCurrency(shift.cashDifference ?? 0)} bold />
        {shift.differenceReason && <p className="mt-1">Motivo: {shift.differenceReason}</p>}
        <TicketDivider />
        <p className="text-center text-[11px] text-muted-foreground">Folio de turno: {shift.id.slice(-8).toUpperCase()}</p>
      </TicketPaper>
    </div>
  );
}
