import { AdminLoginForm } from "@/components/administracion/admin-login-form";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <AdminLoginForm error={params.error} />
    </main>
  );
}
