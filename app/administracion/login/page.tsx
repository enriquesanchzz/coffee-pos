import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/administracion/admin-login-form";
import { getBusinessSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Acceso a Administración" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [params, settings] = await Promise.all([searchParams, getBusinessSettings()]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <AdminLoginForm error={params.error} lockMinutes={settings.pinLockMinutes} />
    </main>
  );
}
