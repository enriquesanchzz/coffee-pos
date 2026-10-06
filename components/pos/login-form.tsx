import { loginWithPin } from "@/actions/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm({ error }: { error?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle as="h1">Nomada Café — Entrar</CardTitle>
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
            <p role="alert" className="text-sm text-destructive">PIN incorrecto. Intenta de nuevo.</p>
          )}
          {error === "sesion" && (
            <p role="alert" className="text-sm text-destructive">Tu sesión expiró. Vuelve a ingresar tu PIN.</p>
          )}
          {error === "bloqueado" && (
            <p role="alert" className="text-sm text-destructive">
              Demasiados intentos fallidos. Espera 5 minutos antes de volver a intentar.
            </p>
          )}
          <Button type="submit">Entrar</Button>
          <p className="text-xs text-muted-foreground">
            El PIN identifica a quién atiende en el mostrador. Para entrar a
            Administración se usa email y password.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
