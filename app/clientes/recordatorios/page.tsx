import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getBusinessSettings } from "@/lib/settings";
import { getDueReminders } from "@/lib/reminders";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReminderList } from "@/components/clientes/reminder-list";

export const metadata: Metadata = { title: "Recordatorios" };
export const dynamic = "force-dynamic";

export default async function RecordatoriosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const settings = await getBusinessSettings();
  const reminders = await getDueReminders(settings);
  const cafe = reminders.filter((r) => r.kind === "CAFE_TE_EXTRANAMOS");
  const petShop = reminders.filter((r) => r.kind === "PET_SHOP_RESURTIDO");

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <PageHeader title="Recordatorios" />
        <p className="-mt-2 text-sm text-muted-foreground">
          Mensajes listos para mandar por WhatsApp. Al enviarlo u omitirlo sale de la lista, y vuelve a salir solo si el
          cliente compra otra vez. Días y mensajes en{" "}
          <Link href="/configuracion/recordatorios" className="underline">
            Configuración → Recordatorios
          </Link>
          .
        </p>

        <Card>
          <CardHeader>
            <CardTitle>
              Cafetería · Te extrañamos ({cafe.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {settings.reminderCafeDays > 0
                ? `Clientes con ${settings.reminderCafeDays} días o más sin comprar en Cafetería.`
                : "Apagado (0 días)."}
            </p>
          </CardHeader>
          <CardContent>
            <ReminderList reminders={cafe} emptyText="Nadie pendiente." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Pet Shop · Resurtido ({petShop.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {settings.reminderPetShopDays > 0
                ? `${settings.reminderPetShopDays} días después de comprar un producto de Pet Shop (cada producto puede tener sus propios días y mensaje).`
                : "Apagado (0 días)."}
            </p>
          </CardHeader>
          <CardContent>
            <ReminderList reminders={petShop} emptyText="Nadie pendiente." />
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
