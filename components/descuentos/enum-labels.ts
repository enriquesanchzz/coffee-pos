import type { DiscountType, DiscountCodeCategory } from "@prisma/client";

export const discountTypeLabels: Record<DiscountType, string> = {
  PORCENTAJE: "% porcentaje",
  MONTO_FIJO: "monto fijo",
  PRECIO_FINAL: "precio final",
};

export const discountCategoryLabels: Record<DiscountCodeCategory, string> = {
  CLIENTE_ESPECIFICO: "Cliente específico",
  CAMPANA: "Campaña",
  EMPLEADO: "Empleado",
};
