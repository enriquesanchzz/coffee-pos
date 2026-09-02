import type {
  UnitOfMeasure,
  PurchaseOrderStatus,
  TransferStatus,
  PhysicalCountStatus,
} from "@prisma/client";

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

export const transferStatusLabels: Record<TransferStatus, string> = {
  ENVIADO: "Enviada",
  EN_TRANSITO: "En tránsito",
  RECIBIDO: "Recibida",
  CANCELADO: "Cancelada",
};

export const physicalCountStatusLabels: Record<PhysicalCountStatus, string> = {
  ABIERTO: "Abierto",
  PENDIENTE_APROBACION: "Pendiente de aprobación",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
};
