import "server-only";
import type { Permission } from "@prisma/client";
import { prisma } from "./prisma";

// Permiso efectivo = permisos del Role asignado en EmployeeBranch para esa
// sucursal, con EmployeePermissionOverride encima (override siempre gana
// sobre el rol) — exactamente como lo documenta el schema.
export async function getEffectivePermissions(
  employeeId: string,
  branchId: string
): Promise<Set<Permission>> {
  const employeeBranch = await prisma.employeeBranch.findUnique({
    where: { employeeId_branchId: { employeeId, branchId } },
    include: {
      role: { include: { permissions: true } },
      permissionOverrides: true,
    },
  });
  if (!employeeBranch) return new Set();

  const permissions = new Set(employeeBranch.role.permissions.map((p) => p.permission));

  for (const override of employeeBranch.permissionOverrides) {
    if (override.isGranted) {
      permissions.add(override.permission);
    } else {
      permissions.delete(override.permission);
    }
  }

  return permissions;
}

export async function hasPermission(
  employeeId: string,
  branchId: string,
  permission: Permission
): Promise<boolean> {
  const permissions = await getEffectivePermissions(employeeId, branchId);
  return permissions.has(permission);
}

export async function requirePermission(
  employeeId: string,
  branchId: string,
  permission: Permission
): Promise<void> {
  if (!(await hasPermission(employeeId, branchId, permission))) {
    throw new Error(`No tienes permiso para hacer esto (falta ${permission}).`);
  }
}
