"use server";

import { revalidatePath } from "next/cache";
import type { UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

// No existe un permiso específico de "transferencias" en el catálogo — se
// usa INVENTARIO_AJUSTAR de forma uniforme (nivel GERENTE en la matriz de
// prisma/seed.ts), consistente con que /inventario ya está gateado igual.

export type CreateTransferLineInput = {
  ingredientId: string;
  quantity: number;
  unit: UnitOfMeasure;
};

export type CreateTransferManifestInput = {
  employeeId: string;
  fromStockLocationId: string;
  toStockLocationId: string;
  notes?: string;
  lines: CreateTransferLineInput[];
};

// Solo crea el manifiesto (status ENVIADO) — el inventario todavía no se
// mueve, eso pasa en markTransferInTransit.
export async function createTransferManifest(input: CreateTransferManifestInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.fromStockLocationId === input.toStockLocationId) {
    throw new Error("El origen y el destino deben ser distintos.");
  }
  if (input.lines.length === 0) {
    throw new Error("Agrega al menos un ingrediente.");
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (line.quantity <= 0) {
      throw new Error("La cantidad de cada línea debe ser mayor a cero.");
    }
    if (seen.has(line.ingredientId)) {
      throw new Error("No repitas el mismo ingrediente en dos líneas.");
    }
    seen.add(line.ingredientId);
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR");

  const manifest = await prisma.transferManifest.create({
    data: {
      fromStockLocationId: input.fromStockLocationId,
      toStockLocationId: input.toStockLocationId,
      initiatedById: input.employeeId,
      notes: input.notes?.trim() || null,
      status: "ENVIADO",
      lines: {
        create: input.lines.map((line) => ({
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
        })),
      },
    },
  });

  revalidatePath("/compras/transferencias");

  return { id: manifest.id };
}

export type MarkTransferInTransitInput = {
  employeeId: string;
  transferManifestId: string;
};

// El inventario sale de origen aquí, no al crear el manifiesto (ver
// comentario en TransferManifest del schema).
export async function markTransferInTransit(input: MarkTransferInTransitInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR");

  await prisma.$transaction(async (tx) => {
    const manifest = await tx.transferManifest.findUnique({
      where: { id: input.transferManifestId },
      include: { lines: true, fromStockLocation: true, toStockLocation: true },
    });
    if (!manifest) {
      throw new Error("La transferencia no existe.");
    }
    if (manifest.status !== "ENVIADO") {
      throw new Error("Esta transferencia ya no está en estado enviado.");
    }

    for (const line of manifest.lines) {
      const stock = await tx.inventoryStock.findUnique({
        where: {
          ingredientId_stockLocationId: {
            ingredientId: line.ingredientId,
            stockLocationId: manifest.fromStockLocationId,
          },
        },
      });
      const available = stock?.quantity.toNumber() ?? 0;
      if (available < line.quantity.toNumber()) {
        throw new Error(
          `No hay suficiente stock de este ingrediente en el origen para enviar la cantidad solicitada.`
        );
      }

      await tx.inventoryStock.update({
        where: {
          ingredientId_stockLocationId: {
            ingredientId: line.ingredientId,
            stockLocationId: manifest.fromStockLocationId,
          },
        },
        data: { quantity: { decrement: line.quantity } },
      });

      await tx.inventoryMovement.create({
        data: {
          type: "TRANSFERENCIA_SALIDA",
          ingredientId: line.ingredientId,
          stockLocationId: manifest.fromStockLocationId,
          quantity: line.quantity.negated(),
          unit: line.unit,
          branchId: manifest.fromStockLocation.branchId,
          transferFromBranchId: manifest.fromStockLocation.branchId,
          transferToBranchId: manifest.toStockLocation.branchId,
          employeeId: input.employeeId,
          transferLineId: line.id,
          notes: `Transferencia ${manifest.id} — salida`,
        },
      });
    }

    await tx.transferManifest.update({
      where: { id: manifest.id },
      data: { status: "EN_TRANSITO", inTransitAt: new Date() },
    });
  });

  revalidatePath("/compras/transferencias");
  revalidatePath(`/compras/transferencias/${input.transferManifestId}`);
  revalidatePath("/inventario");
}

export type ReceiveTransferLineInput = {
  transferLineId: string;
  receivedQuantity: number;
  discrepancyNote?: string;
};

export type ReceiveTransferInput = {
  employeeId: string;
  transferManifestId: string;
  lines: ReceiveTransferLineInput[];
};

// Recepción de una sola vez. Si lo recibido es menor a lo enviado, la
// diferencia se registra como MERMA en destino — ver comentario en
// TransferLine del schema.
export async function receiveTransfer(input: ReceiveTransferInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR");

  for (const line of input.lines) {
    if (line.receivedQuantity < 0) {
      throw new Error("La cantidad recibida no puede ser negativa.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const manifest = await tx.transferManifest.findUnique({
      where: { id: input.transferManifestId },
      include: { lines: true, fromStockLocation: true, toStockLocation: true },
    });
    if (!manifest) {
      throw new Error("La transferencia no existe.");
    }
    if (manifest.status !== "EN_TRANSITO") {
      throw new Error("Esta transferencia no está en tránsito.");
    }

    const linesById = new Map(manifest.lines.map((line) => [line.id, line]));

    for (const receivedLine of input.lines) {
      const line = linesById.get(receivedLine.transferLineId);
      if (!line) {
        throw new Error("Línea de transferencia inválida.");
      }

      await tx.inventoryStock.upsert({
        where: {
          ingredientId_stockLocationId: {
            ingredientId: line.ingredientId,
            stockLocationId: manifest.toStockLocationId,
          },
        },
        update: { quantity: { increment: receivedLine.receivedQuantity } },
        create: {
          ingredientId: line.ingredientId,
          stockLocationId: manifest.toStockLocationId,
          quantity: receivedLine.receivedQuantity,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          type: "TRANSFERENCIA_ENTRADA",
          ingredientId: line.ingredientId,
          stockLocationId: manifest.toStockLocationId,
          quantity: receivedLine.receivedQuantity,
          unit: line.unit,
          branchId: manifest.toStockLocation.branchId,
          transferFromBranchId: manifest.fromStockLocation.branchId,
          transferToBranchId: manifest.toStockLocation.branchId,
          employeeId: input.employeeId,
          transferLineId: line.id,
          notes: `Transferencia ${manifest.id} — entrada`,
        },
      });

      const shortfall = line.quantity.toNumber() - receivedLine.receivedQuantity;
      if (shortfall > 0.0001) {
        await tx.inventoryMovement.create({
          data: {
            type: "MERMA",
            ingredientId: line.ingredientId,
            stockLocationId: manifest.toStockLocationId,
            quantity: -shortfall,
            unit: line.unit,
            branchId: manifest.toStockLocation.branchId,
            transferFromBranchId: manifest.fromStockLocation.branchId,
            transferToBranchId: manifest.toStockLocation.branchId,
            employeeId: input.employeeId,
            transferLineId: line.id,
            notes: `Transferencia ${manifest.id} — merma en tránsito`,
          },
        });
      }

      await tx.transferLine.update({
        where: { id: line.id },
        data: {
          receivedQuantity: receivedLine.receivedQuantity,
          discrepancyNote: receivedLine.discrepancyNote?.trim() || null,
        },
      });
    }

    await tx.transferManifest.update({
      where: { id: manifest.id },
      data: { status: "RECIBIDO", receivedAt: new Date(), receivedById: input.employeeId },
    });
  });

  revalidatePath("/compras/transferencias");
  revalidatePath(`/compras/transferencias/${input.transferManifestId}`);
  revalidatePath("/inventario");
}

export type CancelTransferManifestInput = {
  employeeId: string;
  transferManifestId: string;
};

// Solo se puede cancelar mientras sigue ENVIADO — una vez que el inventario
// salió de origen (EN_TRANSITO) cancelar requeriría lógica de reversión que
// queda fuera de alcance.
export async function cancelTransferManifest(input: CancelTransferManifestInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR");

  const manifest = await prisma.transferManifest.findUnique({
    where: { id: input.transferManifestId },
  });
  if (!manifest) {
    throw new Error("La transferencia no existe.");
  }
  if (manifest.status !== "ENVIADO") {
    throw new Error("Solo se puede cancelar una transferencia que sigue enviada (no en tránsito).");
  }

  await prisma.transferManifest.update({
    where: { id: input.transferManifestId },
    data: { status: "CANCELADO" },
  });

  revalidatePath("/compras/transferencias");
  revalidatePath(`/compras/transferencias/${input.transferManifestId}`);
}
