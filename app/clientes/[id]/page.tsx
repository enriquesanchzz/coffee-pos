import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getCustomerDetail } from "@/lib/customers";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "@/components/clientes/customer-form";
import { formatCurrency } from "@/lib/utils";

export default async function DetalleClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR"))) {
    redirect("/clientes");
  }

  const { id } = await params;
  const customer = await getCustomerDetail(id);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
          <h1 className="text-lg font-semibold">{customer.name}</h1>

          <Card>
            <CardHeader>
              <CardTitle>Lealtad</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm">
              <p>{customer.stamps} de 5 sellos</p>
              <p className="text-muted-foreground">{customer.tierName ?? "sin nivel"}</p>
            </CardContent>
          </Card>

          <CustomerForm employeeId={employee.id} customer={customer} />

          <Card>
            <CardHeader>
              <CardTitle>Historial de compras</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {customer.sales.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin compras todavía.</p>
              )}
              {customer.sales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between text-sm">
                  <span>{new Date(sale.createdAt).toLocaleString("es-MX")}</span>
                  <span>{formatCurrency(sale.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
