import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getUpcomingBirthdays, type UpcomingBirthday } from "@/lib/birthdays";
import { getBusinessSettings } from "@/lib/settings";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/time";
import { toWhatsAppNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Cumpleaños" };

const SPECIES_EMOJI = { PERRO: "🐶", GATO: "🐱", OTRO: "🐾" } as const;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dayLabel(b: UpcomingBirthday) {
  const [, m, d] = b.day.split("-").map(Number);
  const date = `${d} ${MONTHS[m - 1]}`;
  if (b.daysAway === 0) return `Hoy · ${date}`;
  if (b.daysAway === 1) return `Mañana · ${date}`;
  if (b.daysAway < 0) return `Fue el ${date}`;
  return `En ${b.daysAway} días · ${date}`;
}

// Mensaje de felicitación con el código del cupón, listo para mandarse
// desde el WhatsApp del negocio (mientras no haya envío automático).
function whatsAppHref(b: UpcomingBirthday, businessName: string) {
  const digits = b.phone ? toWhatsAppNumber(b.phone) : null;
  if (!digits) return null;
  const firstName = b.customerName.split(" ")[0];
  const greeting =
    b.kind === "CLIENTE"
      ? `¡Feliz cumpleaños, ${firstName}! 🎂`
      : `¡Hola, ${firstName}! ${b.daysAway > 0 ? `Se acerca el cumpleaños de ${b.name}` : `Feliz cumpleaños a ${b.name}`} 🐾🎂`;
  const lines = [greeting];
  if (b.coupon?.status === "disponible") {
    const until = b.coupon.expiresAt ? `, válido hasta el ${formatDate(b.coupon.expiresAt)}` : "";
    lines.push(
      `En ${businessName} ${b.kind === "CLIENTE" ? "te regalamos" : "le regalamos"} ${b.coupon.label.split(" · ")[0]} con el código ${b.coupon.code}${until}.`
    );
  } else {
    lines.push(`Te mandamos un abrazo de parte de ${businessName}.`);
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join(" "))}`;
}

const STATUS_STYLES = {
  disponible: "text-success",
  usado: "text-muted-foreground",
  vencido: "text-muted-foreground",
  inactivo: "text-muted-foreground",
} as const;

export default async function CumpleanosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const [birthdays, settings] = await Promise.all([getUpcomingBirthdays(30), getBusinessSettings()]);
  const couponsOn = settings.birthdayCustomerPercent > 0 || settings.birthdayPetPercent > 0;

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <PageHeader title="Cumpleaños" />
        <p className="-mt-2 text-sm text-muted-foreground">
          Clientes y mascotas que cumplen años en los próximos 30 días.{" "}
          {couponsOn ? (
            <>
              El cupón se entrega solo el día del cumpleaños y aparece en caja al seleccionar al cliente.
            </>
          ) : (
            <>
              Los cupones de cumpleaños están apagados:{" "}
              <Link href="/configuracion/lealtad" className="underline">
                actívalos en Configuración → Lealtad
              </Link>
              .
            </>
          )}
        </p>

        <Card>
          <CardHeader>
            <CardTitle>
              {birthdays.length} cumpleaños
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {birthdays.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nadie cumple años en los próximos 30 días. Las fechas se capturan en el perfil del cliente y de cada mascota.
              </p>
            )}
            {birthdays.map((b) => {
              const href = whatsAppHref(b, settings.businessName);
              return (
                <div key={b.key} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {b.kind === "MASCOTA" ? `${SPECIES_EMOJI[b.species ?? "OTRO"]} ${b.name}` : `🎂 ${b.name}`}
                      {b.turning !== null && <span className="font-normal text-muted-foreground"> · cumple {b.turning}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dayLabel(b)}
                      {b.kind === "MASCOTA" && (
                        <>
                          {" · de "}
                          <Link href={`/clientes/${b.customerId}`} className="underline">
                            {b.customerName}
                          </Link>
                        </>
                      )}
                      {b.kind === "CLIENTE" && (
                        <>
                          {" · "}
                          <Link href={`/clientes/${b.customerId}`} className="underline">
                            ver perfil
                          </Link>
                        </>
                      )}
                    </p>
                    {b.coupon && (
                      <p className="text-xs">
                        {b.coupon.label} <span className="font-mono text-muted-foreground">{b.coupon.code}</span>{" "}
                        <span className={STATUS_STYLES[b.coupon.status]}>{b.coupon.status}</span>
                      </p>
                    )}
                  </div>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm", className: "h-9" })}
                    >
                      Felicitar por WhatsApp
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin teléfono</span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
