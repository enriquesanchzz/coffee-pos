import { loginWithPin } from "@/actions/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm({ error }: { error?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Nomada Café — Entrar</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={loginWithPin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pin">PIN de empleado</Label>
            <Input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="••••"
            />
          </div>
          {error === "pin" && (
            <p className="text-sm text-destructive">PIN incorrecto. Intenta de nuevo.</p>
          )}
          <Button type="submit">Entrar</Button>
          <p className="text-xs text-muted-foreground">
            Esto es un selector de empleado por PIN, no autenticación real.
            Se reemplaza al construir el módulo de Administración.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
