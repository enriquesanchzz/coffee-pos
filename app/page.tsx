import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { LoginForm } from "@/components/pos/login-form";
import { getBusinessSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (employee) redirect("/pos");

  const [params, settings] = await Promise.all([searchParams, getBusinessSettings()]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <LoginForm error={params.error} businessName={settings.businessName} lockMinutes={settings.pinLockMinutes} />
    </main>
  );
}
