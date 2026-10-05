"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RoleOption, EmployeeDetail } from "@/lib/employees";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createEmployee as createEmployeeAction, updateEmployee as updateEmployeeAction } from "@/actions/employees";
import { withActionErrors } from "@/lib/action-result";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createEmployee = withActionErrors(createEmployeeAction);
const updateEmployee = withActionErrors(updateEmployeeAction);

export function EmployeeForm({
  roles,
  employee,
  currentEmployeeId,
}: {
  roles: RoleOption[];
  employee?: EmployeeDetail;
  // Para advertir cuando alguien edita su propio rol/acceso.
  currentEmployeeId?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(employee);
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [roleId, setRoleId] = useState(employee?.roleId ?? roles[0]?.id ?? "");
  const [isCashier, setIsCashier] = useState(employee?.isCashier ?? false);
  const [isActive, setIsActive] = useState(employee?.isActive ?? true);
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingSelfChange, setConfirmingSelfChange] = useState(false);
  const [lostOwnAccess, setLostOwnAccess] = useState(false);

  const isSelf = Boolean(employee && employee.id === currentEmployeeId);
  const changesOwnAccess =
    isSelf && employee && (roleId !== employee.roleId || (employee.isActive && !isActive));

  // Desactivar a alguien le quita el acceso de inmediato: se confirma.
  const deactivatesSomeone = Boolean(employee?.isActive && !isActive && !isSelf);

  function handleSubmit() {
    if ((changesOwnAccess || deactivatesSomeone) && !confirmingSelfChange) {
      setConfirmingSelfChange(true);
      return;
    }
    setConfirmingSelfChange(false);
    setError(null);
    startTransition(async () => {
      try {
        if (employee) {
          const result = await updateEmployee({
            employeeId: employee.id,
            name,
            email,
            pin: pin || undefined,
            password: password || undefined,
            isActive,
            roleId,
            isCashier,
          });
          if (result?.changedOwnAccess && changesOwnAccess) {
            // Ya no tiene acceso a esta pantalla: se le explica en vez de
            // que la siguiente navegación lo mande a /pos sin aviso.
            setLostOwnAccess(true);
            return;
          }
        } else {
          await createEmployee({
            name,
            email,
            pin: pin || undefined,
            password: password || undefined,
            roleId,
            isCashier,
          });
        }
        router.push("/empleados");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el empleado.");
      }
    });
  }

  if (lostOwnAccess) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <h1 className="text-lg font-semibold">Cambios guardados</h1>
        <p className="text-sm text-muted-foreground">
          Cambiaste tu propio rol o acceso, así que ya no puedes entrar a Administración con esta cuenta.
        </p>
        <Button onClick={() => router.push("/pos")}>Ir al Punto de Venta</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">
          {isEdit ? `Editar — ${employee!.name}` : "Nuevo empleado"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="email">Email (necesario para acceso a Administración)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="role">Rol</Label>
            <Select id="role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCashier}
              onChange={(e) => setIsCashier(e.target.checked)}
            />
            Puede ser cajero (abrir/cerrar turno)
          </label>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Activo
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acceso</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pin">
              PIN {isEdit && employee?.hasPin ? "(déjalo vacío para no cambiarlo)" : "(4 a 6 dígitos, para el POS)"}
            </Label>
            <Input
              id="pin"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={isEdit && employee?.hasPin ? "••••" : "1234"}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="password">
              Password{" "}
              {isEdit && employee?.hasPassword
                ? "(déjalo vacío para no cambiarlo)"
                : "(mínimo 8 caracteres, para entrar a Administración)"}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit && employee?.hasPassword ? "••••••••" : ""}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear empleado"}
      </Button>
      <ConfirmDialog
        open={confirmingSelfChange}
        title={deactivatesSomeone ? `¿Desactivar a ${employee?.name}?` : "¿Cambiar tu propio acceso?"}
        message={
          deactivatesSomeone
            ? "Ya no podrá entrar al POS ni a Administración. Su historial de ventas se conserva y puedes reactivarlo después."
            : "Estás cambiando tu propio rol o desactivando tu cuenta. Si dejas de ser ADMINISTRADOR, perderás el acceso a Administración en cuanto guardes."
        }
        confirmLabel="Sí, guardar"
        destructive
        onConfirm={handleSubmit}
        onCancel={() => setConfirmingSelfChange(false)}
      />
    </div>
  );
}
