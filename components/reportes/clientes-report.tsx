import type { CustomerDemographics } from "@/lib/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ClientesReport({ demographics }: { demographics: CustomerDemographics }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Clientes</h2>
        <p className="text-sm text-muted-foreground">
          {demographics.totalCustomers} cliente{demographics.totalCustomers === 1 ? "" : "s"} registrado
          {demographics.totalCustomers === 1 ? "" : "s"}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por edad</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {demographics.byAgeBucket.map((row) => (
            <div key={row.bucket} className="flex items-center justify-between text-sm">
              <span>{row.bucket}</span>
              <span className="text-muted-foreground">{row.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Por género</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {demographics.byGender.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span>{row.label}</span>
              <span className="text-muted-foreground">{row.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
