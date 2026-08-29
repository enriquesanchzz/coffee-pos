"use client";

import { useState } from "react";
import type { InventoryOverviewItem } from "@/lib/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { unitLabels } from "./unit-labels";

const categoryLabels: Record<string, string> = {
  CAFE: "Café",
  JARABES: "Jarabes",
  LECHE: "Leche",
  TOPPINGS: "Toppings",
  INSUMOS: "Insumos",
};

export function InventoryOverview({
  items,
  employeeId,
}: {
  items: InventoryOverviewItem[];
  employeeId: string;
}) {
  const [adjusting, setAdjusting] = useState<InventoryOverviewItem | null>(null);

  const groups = items.reduce<Record<string, InventoryOverviewItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <div>
        <h1 className="text-lg font-semibold">Inventario</h1>
        <p className="text-sm text-muted-foreground">
          Existencias actuales por ingrediente en la sucursal.
        </p>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay ingredientes activos registrados.</p>
      )}

      {Object.entries(groups).map(([category, categoryItems]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{categoryLabels[category] ?? category}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {categoryItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div>
                  <p>{item.name}</p>
                  {item.isLow && (
                    <Badge variant="destructive" className="mt-1 text-[10px]">
                      stock bajo
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span>
                    {new Intl.NumberFormat("es-MX").format(item.quantity)}{" "}
                    {unitLabels[item.baseUnit] ?? item.baseUnit}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setAdjusting(item)}>
                    Ajustar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <AdjustStockDialog
        item={adjusting}
        employeeId={employeeId}
        onOpenChange={(open) => !open && setAdjusting(null)}
      />
    </div>
  );
}
