import type { UnitOfMeasure, PurchaseOrderStatus } from "@prisma/client";

export const unitLabels: Record<UnitOfMeasure, string> = {
  KG: "kg",
  G: "g",
  L: "L",
  ML: "ml",
  PUMP: "pump",
  PIEZA: "pza",
  CUCHARADA: "cda",
  ESPRESSO_SHOT: "shot",
};

export const purchaseOrderStatusLabels: Record<PurchaseOrderStatus, string> = {
  CREADA: "Creada",
  PROVEIDA: "Proveída",
  PROVEIDA_PARCIALMENTE: "Proveída parcialmente",
  CANCELADA: "Cancelada",
};
