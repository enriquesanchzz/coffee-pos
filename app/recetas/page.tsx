import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getRecipeOverview } from "@/lib/recipes";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export default async function RecetasPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const products = await getRecipeOverview();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Recetas</h1>
              <p className="text-sm text-muted-foreground">
                Productos, variantes y su receta activa.
              </p>
            </div>
            <Link
              href="/recetas/nuevo"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Nuevo producto
            </Link>
          </div>

          {products.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay productos.</p>
          )}

          {products.map((product) => (
            <Card key={product.id}>
              <CardHeader>
                <CardTitle>{product.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{product.categoryName}</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {product.variants.map((variant) => (
                  <div key={variant.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p>{variant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {variant.lineCount} ingrediente{variant.lineCount === 1 ? "" : "s"}
                        {!variant.isActive && " — inactiva"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{formatCurrency(variant.price)}</span>
                      <Link
                        href={`/recetas/${variant.id}`}
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
      </div>
    </div>
  );
}
