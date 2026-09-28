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

// Gate por identidad de rol, no por permiso efectivo — igual que
// lib/session.ts resolveRoleName() (usado en las páginas), pero para
// Server Actions que solo tienen employeeId, no el empleado completo con
// `branches` ya cargado. Las acciones detrás de Clientes/Reportes/Compras/
// Productos/Inventario/Administración deben quedar exclusivas de
// ADMINISTRADOR incluso si alguien más tiene el permiso granular
// correspondiente vía EmployeePermissionOverride — un permiso puntual no
// debe alcanzar para operar un módulo entero reservado al rol.
export async function requireAdminRole(employeeId: string, branchId: string): Promise<void> {
  const employeeBranch = await prisma.employeeBranch.findUnique({
    where: { employeeId_branchId: { employeeId, branchId } },
    include: { role: true },
  });
  if (employeeBranch?.role.name !== "ADMINISTRADOR") {
    throw new Error("Esta acción es exclusiva del rol ADMINISTRADOR.");
  }
}
