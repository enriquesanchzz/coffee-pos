import { loginWithPin } from "@/actions/session";
import { tooManyAttemptsText } from "@/lib/settings-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm({
  error,
  businessName,
  lockMinutes,
}: {
  error?: string;
  businessName: string;
  lockMinutes: number;
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle as="h1">{businessName} — Entrar</CardTitle>
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
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="off"
              aria-invalid={error === "pin" || error === "vacio" || undefined}
              aria-describedby={error ? "pin-error" : undefined}
              autoFocus
              placeholder="••••"
            />
          </div>
          {error === "vacio" && (
            <p id="pin-error" role="alert" className="text-sm text-destructive">Escribe tu PIN.</p>
          )}
          {error === "pin" && (
            <p id="pin-error" role="alert" className="text-sm text-destructive">PIN incorrecto. Intenta de nuevo.</p>
          )}
          {error === "sesion" && (
            <p id="pin-error" role="alert" className="text-sm text-destructive">Tu sesión expiró. Vuelve a ingresar tu PIN.</p>
          )}
          {error === "bloqueado" && (
            <p id="pin-error" role="alert" className="text-sm text-destructive">
              {tooManyAttemptsText(lockMinutes)}
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
