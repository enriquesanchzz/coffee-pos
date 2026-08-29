import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";

export type EmployeeListItem = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  roleName: string | null;
  isCashier: boolean;
  hasPin: boolean;
  hasPassword: boolean;
};

// Lista de empleados para /administracion. El rol/isCashier mostrados son
// los de DEFAULT_BRANCH_ID — la asignación multi-sucursal por empleado
// sigue fuera de alcance hasta Fase 5, igual que el resto de la app.
export async function getEmployees(): Promise<EmployeeListItem[]> {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    include: {
      branches: { where: { branchId: DEFAULT_BRANCH_ID }, include: { role: true } },
    },
  });

  return employees.map((employee) => {
    const branch = employee.branches[0];
    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      isActive: employee.isActive,
      roleName: branch?.role.name ?? null,
      isCashier: branch?.isCashier ?? false,
      hasPin: Boolean(employee.pin),
      hasPassword: Boolean(employee.passwordHash),
    };
  });
}

export type RoleOption = { id: string; name: string };

export async function getRoles(): Promise<RoleOption[]> {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  return roles.map((role) => ({ id: role.id, name: role.name }));
}

export type EmployeeDetail = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  roleId: string | null;
  isCashier: boolean;
  hasPin: boolean;
  hasPassword: boolean;
};

export async function getEmployeeDetail(id: string): Promise<EmployeeDetail> {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id },
    include: {
      branches: { where: { branchId: DEFAULT_BRANCH_ID }, include: { role: true } },
    },
  });
  const branch = employee.branches[0];

  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    isActive: employee.isActive,
    roleId: branch?.roleId ?? null,
    isCashier: branch?.isCashier ?? false,
    hasPin: Boolean(employee.pin),
    hasPassword: Boolean(employee.passwordHash),
  };
}
