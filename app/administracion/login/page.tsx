import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/administracion/admin-login-form";
import { getBusinessSettings } from "@/lib/settings";
import { safeNextPath } from "@/lib/admin-page";

export const metadata: Metadata = { title: "Acceso a Administración" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const [params, settings] = await Promise.all([searchParams, getBusinessSettings()]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <AdminLoginForm error={params.error} next={safeNextPath(params.next)} lockMinutes={settings.pinLockMinutes} />
    </main>
  );
}
