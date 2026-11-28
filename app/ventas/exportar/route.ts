import type { NextRequest } from "next/server";
import type { SaleOrderType, SaleStatus } from "@prisma/client";
import { requirePasswordSession, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { syncAppTimeZone } from "@/lib/settings";
import { getSalesForExport, parseSalesParams, SALES_EXPORT_LIMIT } from "@/lib/sales";
import { zonedClock, zonedDateKey } from "@/lib/time";

// Ventas → "Exportar CSV": descarga las ventas que cumplen los filtros de
// la pantalla, sin paginar. Pensado para abrirse en Excel / Google Sheets.

const STATUS_LABELS: Record<SaleStatus, string> = {
  COMPLETADA: "Cobrada",
  CANCELADA: "Cancelada",
  ABIERTA: "En espera",
};
const ORDER_TYPE_LABELS: Record<SaleOrderType, string> = {
  CONSUMO_LOCAL: "Mesa",
  PARA_LLEVAR: "Para llevar",
  DOMICILIO: "A domicilio",
};

// RFC 4180: comillas si hay coma, comilla o salto de línea. Además se
// neutralizan valores que Excel interpretaría como fórmula (= + - @) —
// el nombre de un cliente o un motivo los escribe cualquiera.
function cell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return value.toFixed(2);
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: NextRequest) {
  // Igual que el resto de Administración: rol ADMINISTRADOR con sesión de
  // email + password (lib/admin-page.ts).
  const employee = await requirePasswordSession();
  if (!employee || resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") {
    return new Response("No autorizado", { status: 403 });
  }
  await syncAppTimeZone();

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const { filters, query } = parseSalesParams(params);
  const { rows, truncated } = await getSalesForExport(filters);

  const header = [
    "Folio", "Fecha", "Hora", "Estado", "Tipo", "Mesa / referencia", "Cliente", "Atendió",
    "Productos", "Subtotal", "Descuento", "Código de descuento", "IVA incluido", "Total", "Propina",
    "Efectivo", "Tarjeta", "Transferencia", "Motivo de cancelación",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const { hour, minute } = zonedClock(r.createdAt);
    lines.push(
      [
        cell(r.folio),
        cell(zonedDateKey(r.createdAt)),
        cell(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`),
        cell(STATUS_LABELS[r.status]),
        cell(ORDER_TYPE_LABELS[r.orderType]),
        cell(r.tableNumber),
        cell(r.customerName),
        cell(r.employeeName),
        String(r.itemCount),
        cell(r.subtotal),
        cell(r.discountTotal),
        cell(r.discountCode),
        cell(r.taxAmount),
        cell(r.total),
        cell(r.tipAmount),
        cell(r.byMethod.EFECTIVO),
        cell(r.byMethod.TARJETA),
        cell(r.byMethod.TRANSFERENCIA),
        cell(r.cancelReason),
      ].join(",")
    );
  }
  if (truncated) {
    lines.push(cell(`Archivo recortado a las primeras ${SALES_EXPORT_LIMIT} ventas: acota el rango de fechas.`));
  }

  // BOM para que Excel abra el archivo como UTF-8 (acentos y ñ).
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const filename = `ventas_${query.get("from")}_a_${query.get("to")}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
