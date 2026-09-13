import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getRecipeOverview, type RecipeOverviewProduct } from "@/lib/recipes";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { temperatureLabels } from "@/components/productos/enum-labels";

// Agrupa por categoría padre (o por la categoría misma si no tiene padre,
// ej. "Café en grano") — punto 1, "Módulo Productos". Mismo criterio de
// árbol de 2 niveles ya usado en la nav del POS
// (components/pos/catalog-browser.tsx).
function groupByParentCategory(products: RecipeOverviewProduct[]) {
  const groups = new Map<string, RecipeOverviewProduct[]>();
  for (const product of products) {
    const groupName = product.parentCategoryName ?? product.categoryName;
    groups.set(groupName, [...(groups.get(groupName) ?? []), product]);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));
}

export default async function ProductosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const products = await getRecipeOverview();
  const groups = groupByParentCategory(products);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Productos</h1>
              <p className="text-sm text-muted-foreground">
                Bebidas con receta, merch, souvenirs y tarjetas de regalo.
              </p>
            </div>
            <Link
              href="/productos/nuevo"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Nuevo producto
            </Link>
          </div>

          {products.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay productos.</p>
          )}

          {groups.map(([groupName, groupProducts]) => (
            <div key={groupName} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {groupName}
              </h2>
              {groupProducts.map((product) => (
                <Card key={product.id}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>{product.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{product.categoryName}</p>
                    </div>
                    <Link
                      href={`/productos/${product.id}/variantes/nueva`}
                      className="text-sm text-primary hover:underline"
                    >
                      + Agregar variante
                    </Link>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {product.variants.map((variant) => (
                      <div key={variant.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p>
                            {variant.name}
                            {variant.temperature && ` · ${temperatureLabels[variant.temperature]}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {product.type === "RECETA"
                              ? `${variant.lineCount} ingrediente${variant.lineCount === 1 ? "" : "s"}${variant.sizeOz ? ` · ${variant.sizeOz}oz` : ""}`
                              : [variant.size && `Talla ${variant.size}`, variant.color && `Color ${variant.color}`, variant.note]
                                  .filter(Boolean)
                                  .join(" · ") || "Reventa directa"}
                            {!variant.isActive && " — inactiva"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span>{formatCurrency(variant.price)}</span>
                          <Link
                            href={`/productos/variantes/${variant.id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            Editar
                          </Link>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
