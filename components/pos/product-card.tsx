"use client";

import { formatCurrency } from "@/lib/utils";
import type { CatalogProduct } from "@/lib/catalog";
import { Card } from "@/components/ui/card";

// Tono estable por producto (mismo nombre, mismo color) para que cada
// tarjeta sin foto se distinga de un vistazo en vez de repetir el mismo
// icono de taza.
function tileHue(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

// Tarjeta cuadrada: foto o inicial de color + nombre + precio. Toda la
// tarjeta abre ProductDialog (tamaño/temperatura/sabor/tipo de leche/
// extras/notas se eligen ahí). Un producto sin existencia se atenúa pero
// sigue seleccionable — el conteo puede estar desfasado.
export function ProductCard({
  product,
  onSelectProduct,
}: {
  product: CatalogProduct;
  onSelectProduct: (product: CatalogProduct) => void;
}) {
  const prices = product.variants.map((v) => v.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const hasPriceRange = minPrice !== maxPrice;
  const hue = tileHue(product.name);

  return (
    <Card
      className={`flex aspect-square cursor-pointer flex-col overflow-hidden rounded-2xl p-0 transition-shadow hover:shadow-md ${
        product.outOfStock ? "opacity-60" : ""
      }`}
      onClick={() => onSelectProduct(product)}
    >
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        style={product.imageUrl ? undefined : { backgroundColor: `hsl(${hue} 60% 90%)` }}
      >
        {product.imageUrl ? (
          // Imagen por URL externa — no hay storage de archivos configurado.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl font-bold" style={{ color: `hsl(${hue} 45% 35%)` }}>
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
        {product.outOfStock && (
          <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold">
            Sin stock
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-base font-semibold leading-tight">{product.name}</p>
        <p className="text-sm text-muted-foreground">
          {hasPriceRange ? "Desde " : ""}
          {formatCurrency(minPrice)}
        </p>
      </div>
    </Card>
  );
}
