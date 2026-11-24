import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getSaleReceiptDetail } from "@/lib/receipt";
import { getBusinessSettings } from "@/lib/settings";
import { includedTax } from "@/lib/settings-shared";
import { formatCurrency } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { TicketPaper, TicketDivider, TicketRow } from "@/components/receipts/ticket-paper";
import { TicketActions } from "@/components/receipts/ticket-actions";

export const metadata: Metadata = { title: "Cuenta" };

function accountLabel(orderType: string, tableNumber: string | null) {
  if (orderType === "CONSUMO_LOCAL") return `Mesa ${tableNumber ?? "—"}`;
  const kind = orderType === "DOMICILIO" ? "A domicilio" : "Para llevar";
  return tableNumber ? `${kind} — ${tableNumber}` : kind;
}

// Pre-cuenta: lo que se le muestra al cliente cuando pide la cuenta, antes
// de cobrar. Solo para cuentas en espera (ABIERTA) — no es comprobante de
// pago; descuentos con código/manuales y la propina se aplican al cobrar.
export default async function PreBillPage({ params }: { params: Promise<{ saleId: string }> }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const { saleId } = await params;
  const [sale, settings] = await Promise.all([getSaleReceiptDetail(saleId), getBusinessSettings()]);

  if (sale.status !== "ABIERTA") {
    return (
      <div className="min-h-screen bg-muted/30 py-6">
        <TicketActions backHref="/pos" />
        <TicketPaper>
          <p className="text-center">
            {sale.status === "COMPLETADA"
              ? "Esta cuenta ya se cobró — imprime el ticket de venta."
              : "Esta cuenta ya no está abierta."}
          </p>
        </TicketPaper>
      </div>
    );
  }

  const tax = includedTax(sale.total, settings);

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
          <p className="mt-1 font-bold">CUENTA</p>
        </div>
        <TicketDivider />
        <p>{accountLabel(sale.orderType, sale.tableNumber)}</p>
        <p>{formatDateTime(new Date())}</p>
        <p>Atendió: {sale.employeeName}</p>
        {sale.customerName && <p>Cliente: {sale.customerName}</p>}
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
          </div>
        ))}

        <TicketDivider />
        <TicketRow label="Total" value={formatCurrency(sale.total)} bold />
        {tax > 0 && <p className="text-[11px] text-muted-foreground">Incluye IVA {formatCurrency(tax)}</p>}

        {settings.tipPercents.length > 0 && sale.total > 0 && (
          <>
            <TicketDivider />
            <p className="text-[11px] font-bold uppercase tracking-wide">Propina sugerida (opcional)</p>
            {settings.tipPercents.map((pct) => {
              const tip = Math.round(sale.total * pct) / 100;
              return (
                <TicketRow
                  key={pct}
                  label={`${pct}% · ${formatCurrency(tip)}`}
                  value={`Total ${formatCurrency(sale.total + tip)}`}
                />
              );
            })}
          </>
        )}

        <TicketDivider />
        <p className="text-center text-[11px]">Este documento no es un comprobante de pago.</p>
      </TicketPaper>
    </div>
  );
}
