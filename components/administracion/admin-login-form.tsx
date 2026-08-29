import { loginAdmin } from "@/actions/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AdminLoginForm({ error }: { error?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Administración — Entrar</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={loginAdmin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" />
          </div>
          {error === "credenciales" && (
            <p className="text-sm text-destructive">Email o password incorrectos.</p>
          )}
          <Button type="submit">Entrar</Button>
          <p className="text-xs text-muted-foreground">
            Esto requiere password, no el PIN del POS — ver docs/CONTINUE.md.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
