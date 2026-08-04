import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { LoginForm } from "@/components/pos/login-form";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (employee) redirect("/pos");

  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <LoginForm error={params.error} />
    </main>
  );
}
