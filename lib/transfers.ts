import { prisma } from "./prisma";

export type StockLocationOption = {
  id: string;
  name: string;
  type: string;
  branchId: string | null;
};

export async function getStockLocations(): Promise<StockLocationOption[]> {
  const locations = await prisma.stockLocation.findMany({ orderBy: { name: "asc" } });
  return locations.map((location) => ({
    id: location.id,
    name: location.name,
    type: location.type,
    branchId: location.branchId,
  }));
}

export type TransferManifestListItem = {
  id: string;
  fromName: string;
  toName: string;
  status: string;
  sentAt: string;
  itemCount: number;
};

export async function getTransferManifests(): Promise<TransferManifestListItem[]> {
  const manifests = await prisma.transferManifest.findMany({
    orderBy: { sentAt: "desc" },
    include: { fromStockLocation: true, toStockLocation: true, lines: true },
  });

  return manifests.map((manifest) => ({
    id: manifest.id,
    fromName: manifest.fromStockLocation.name,
    toName: manifest.toStockLocation.name,
    status: manifest.status,
    sentAt: manifest.sentAt.toISOString(),
    itemCount: manifest.lines.length,
  }));
}

export type TransferLineDetail = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  receivedQuantity: number | null;
  discrepancyNote: string | null;
};

export type TransferManifestDetail = {
  id: string;
  status: string;
  fromStockLocationId: string;
  fromName: string;
  toStockLocationId: string;
  toName: string;
  initiatedByName: string;
  receivedByName: string | null;
  sentAt: string;
  inTransitAt: string | null;
  receivedAt: string | null;
  notes: string | null;
  lines: TransferLineDetail[];
};

export async function getTransferManifestDetail(id: string): Promise<TransferManifestDetail> {
  const manifest = await prisma.transferManifest.findUniqueOrThrow({
    where: { id },
    include: {
      fromStockLocation: true,
      toStockLocation: true,
      initiatedBy: true,
      receivedBy: true,
      lines: { include: { ingredient: true } },
    },
  });

  return {
    id: manifest.id,
    status: manifest.status,
    fromStockLocationId: manifest.fromStockLocationId,
    fromName: manifest.fromStockLocation.name,
    toStockLocationId: manifest.toStockLocationId,
    toName: manifest.toStockLocation.name,
    initiatedByName: manifest.initiatedBy.name,
    receivedByName: manifest.receivedBy?.name ?? null,
    sentAt: manifest.sentAt.toISOString(),
    inTransitAt: manifest.inTransitAt?.toISOString() ?? null,
    receivedAt: manifest.receivedAt?.toISOString() ?? null,
    notes: manifest.notes,
    lines: manifest.lines.map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientName: line.ingredient.name,
      quantity: line.quantity.toNumber(),
      unit: line.unit,
      receivedQuantity: line.receivedQuantity?.toNumber() ?? null,
      discrepancyNote: line.discrepancyNote,
    })),
  };
}
