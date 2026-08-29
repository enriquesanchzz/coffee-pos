"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RoleOption, EmployeeDetail } from "@/lib/employees";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createEmployee, updateEmployee } from "@/actions/employees";

export function EmployeeForm({
  roles,
  employee,
}: {
  roles: RoleOption[];
  employee?: EmployeeDetail;
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

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        if (employee) {
          await updateEmployee({
            employeeId: employee.id,
            name,
            email,
            pin: pin || undefined,
            password: password || undefined,
            isActive,
            roleId,
            isCashier,
          });
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
        router.push("/administracion");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el empleado.");
      }
    });
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
    </div>
  );
}
