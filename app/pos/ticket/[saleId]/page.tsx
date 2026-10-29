import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getSaleReceiptDetail } from "@/lib/receipt";
import { getBusinessSettings } from "@/lib/settings";
import { DEFAULT_TICKET_FOOTER_MESSAGE, PAYMENT_METHOD_LABELS } from "@/lib/settings-shared";
import { formatCurrency } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { TicketPaper, TicketDivider, TicketRow } from "@/components/receipts/ticket-paper";
import { TicketActions } from "@/components/receipts/ticket-actions";

export const metadata: Metadata = { title: "Ticket de venta" };

const ORDER_TYPE_LABELS: Record<string, string> = {
  CONSUMO_LOCAL: "Mesa",
  PARA_LLEVAR: "Para llevar",
  DOMICILIO: "A domicilio",
};

export default async function SaleTicketPage({ params }: { params: Promise<{ saleId: string }> }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const { saleId } = await params;
  const [sale, settings] = await Promise.all([getSaleReceiptDetail(saleId), getBusinessSettings()]);

  return (
    <div className="min-h-screen bg-muted/30 py-6">
      <TicketActions backHref="/pos" />
      <TicketPaper>
        <div className="text-center">
          {settings.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logoUrl} alt={settings.businessName} className="mx-auto mb-1 h-12 w-auto object-contain" />
          )}
          <p className="text-sm font-bold">{settings.businessName}</p>
          {settings.razonSocial && <p>{settings.razonSocial}</p>}
          {settings.rfc && <p>RFC: {settings.rfc}</p>}
          {settings.address && <p>{settings.address}</p>}
          {settings.phone && <p>Tel. {settings.phone}</p>}
        </div>
        <TicketDivider />
        <p>Folio: {sale.id.slice(-8).toUpperCase()}</p>
        <p>{formatDateTime(sale.createdAt)}</p>
        <p>Atendió: {sale.employeeName}</p>
        <p>
          {ORDER_TYPE_LABELS[sale.orderType] ?? sale.orderType}
          {sale.tableNumber ? ` ${sale.tableNumber}` : ""}
        </p>
        {sale.customerName && <p>Cliente: {sale.customerName}</p>}
        {sale.status === "CANCELADA" && <p className="font-bold">*** VENTA ANULADA ***</p>}
        <TicketDivider />

        {sale.items.map((item) => (
          <div key={item.id} className="mb-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span>
                {item.quantity} × {item.productName} {item.variantName}
              </span>
              <span className="flex-shrink-0">{formatCurrency(item.lineTotal)}</span>
            </div>
            {item.comboName && <p className="pl-3 text-[11px]">Paquete: {item.comboName}</p>}
            {item.modifierNames.length > 0 && <p className="pl-3 text-[11px]">{item.modifierNames.join(", ")}</p>}
            {item.extraNames.length > 0 && <p className="pl-3 text-[11px]">+ {item.extraNames.join(", + ")}</p>}
            {item.notes && <p className="pl-3 text-[11px] italic">&ldquo;{item.notes}&rdquo;</p>}
          </div>
        ))}

        <TicketDivider />
        <TicketRow label="Subtotal" value={formatCurrency(sale.subtotal)} />
        {sale.discountTotal > 0 && <TicketRow label="Descuento" value={`-${formatCurrency(sale.discountTotal)}`} />}
        {sale.tipAmount > 0 && <TicketRow label="Propina" value={formatCurrency(sale.tipAmount)} />}
        <TicketRow label="Total" value={formatCurrency(sale.total + sale.tipAmount)} bold />
        {sale.taxAmount > 0 && <p className="text-[11px] text-muted-foreground">Incluye IVA {formatCurrency(sale.taxAmount)}</p>}
        <TicketDivider />
        {sale.payments.map((payment, i) => (
          <TicketRow key={i} label={PAYMENT_METHOD_LABELS[payment.method]} value={formatCurrency(payment.amount)} />
        ))}

        <TicketDivider />
        <p className="text-center">{settings.ticketFooterMessage || DEFAULT_TICKET_FOOTER_MESSAGE}</p>
        {settings.ticketPromoMessage && <p className="mt-1 text-center">{settings.ticketPromoMessage}</p>}
        {settings.wifiNetwork && (
          <>
            <TicketDivider />
            <p className="text-center">
              Wifi: {settings.wifiNetwork}
              {settings.wifiPassword && ` · ${settings.wifiPassword}`}
            </p>
          </>
        )}
      </TicketPaper>
    </div>
  );
}
