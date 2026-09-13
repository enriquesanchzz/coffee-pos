"use client";

import { Coffee } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CatalogProduct } from "@/lib/catalog";
import { Card } from "@/components/ui/card";

// Tarjeta cuadrada simple: imagen + nombre + precio, toda la tarjeta es
// un botón que abre ProductDialog (tamaño/temperatura/sabor/tipo de
// leche/extras/notas se eligen ahí). Se prefirió esto sobre el
// "agregar rápido" de una fase anterior — con productos que tienen
// grupos de modificador obligatorios (sabor, tipo de leche) un botón que
// agrega directo sin abrir el diálogo puede saltarse esas elecciones.
export function ProductCard({
  product,
  onSelectProduct,
}: {
  product: CatalogProduct;
  onSelectProduct: (product: CatalogProduct) => void;
}) {
  const fromPrice = product.variants.length > 0 ? Math.min(...product.variants.map((v) => v.price)) : 0;

  return (
    <Card
      className="flex aspect-square cursor-pointer flex-col overflow-hidden rounded-2xl p-0 transition-shadow hover:shadow-md"
      onClick={() => onSelectProduct(product)}
    >
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted">
        {product.imageUrl ? (
          // Imagen por URL externa — no hay storage de archivos configurado.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <Coffee className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="p-3">
        <p className="text-base font-semibold leading-tight">{product.name}</p>
        <p className="text-sm text-muted-foreground">
          {product.variants.length > 1 ? "Desde " : ""}
          {formatCurrency(fromPrice)}
        </p>
      </div>
    </Card>
  );
}
