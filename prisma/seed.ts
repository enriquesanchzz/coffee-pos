import { PrismaClient, Permission, RoleName } from "@prisma/client";

const prisma = new PrismaClient();

// -------------------------------------------------------------------------
// Matriz de permisos por rol, según respuestas de Fase 0 (sección 5.2).
//
// Jerarquía confirmada por el negocio:
//   ADMINISTRADOR = todos los permisos que existen (unión de todo), incluye
//                   3 permisos EXCLUSIVOS que ningún otro rol recibe:
//                   SUCURSAL_GESTIONAR, REPORTE_CONSOLIDADO_VER,
//                   CONFIGURACION_SISTEMA_GESTIONAR.
//   GERENTE       = lo suyo propio + todo lo de BARISTA + todo lo de AUXILIAR,
//                   pero NUNCA los 3 permisos exclusivos de arriba.
//   BARISTA       = rol "default" de venta.
//   AUXILIAR      = el más limitado (checar asistencia + consultar).
//
// NOTA ABIERTA: el documento menciona un "rol de cajero" que se puede
// activar/desactivar por empleado — ya resuelto como EmployeeBranch.isCashier
// en el schema (no es un Role ni un Permission, es independiente de ambos).
// -------------------------------------------------------------------------

const auxiliarPermissions: Permission[] = [
  Permission.ASISTENCIA_CHECAR,
  Permission.MENU_CONSULTAR,
  Permission.INVENTARIO_CONSULTAR, // "consultar inventario de insumos"
];

const baristaPermissions: Permission[] = [
  Permission.VENTA_REALIZAR,
  Permission.VENTA_CANCELAR,
  Permission.COMPRA_REGISTRAR,
  Permission.ORDEN_COMPRA_CREAR,
  Permission.CLIENTE_CONFIGURAR,
  Permission.DESCUENTO_APLICAR_CODIGO,
];

const gerentePermissionsPropios: Permission[] = [
  Permission.REPORTE_UTILIDAD_VER,
  Permission.REPORTE_UTILIDAD_CREAR,
  Permission.REPORTE_INVENTARIO_VER,
  Permission.REPORTE_INVENTARIO_CREAR,
  Permission.EMPLEADO_CREAR,
  Permission.EMPLEADO_MODIFICAR,
  Permission.EMPLEADO_ELIMINAR,
  Permission.INVENTARIO_CREAR_ITEM,
  Permission.INVENTARIO_AJUSTAR,
  Permission.RECETA_CREAR,
  Permission.RECETA_MODIFICAR,
  Permission.PRODUCTO_CREAR,
  Permission.CAJA_ABRIR,
  Permission.CAJA_CERRAR,
  Permission.CAJA_CORTE_AUTORIZAR,
  Permission.CAJA_CHICA_MODIFICAR,
  Permission.ESTADISTICAS_GESTIONAR,
  Permission.DEVOLUCION_REALIZAR,
  Permission.PRECIO_MODIFICAR,
  Permission.DESCUENTO_CODIGO_CREAR,
  Permission.DESCUENTO_MANUAL,
];

// Gerente puede hacer todo lo de Barista y Auxiliar, además de lo suyo.
const gerentePermissions: Permission[] = Array.from(
  new Set([
    ...gerentePermissionsPropios,
    ...baristaPermissions,
    ...auxiliarPermissions,
  ])
);

// Administrador tiene absolutamente todos los permisos que existan en el enum.
const administradorPermissions: Permission[] = Object.values(Permission);

const roleMatrix: Record<RoleName, Permission[]> = {
  [RoleName.ADMINISTRADOR]: administradorPermissions,
  [RoleName.GERENTE]: gerentePermissions,
  [RoleName.BARISTA]: baristaPermissions,
  [RoleName.AUXILIAR]: auxiliarPermissions,
};

async function main() {
  console.log("Sembrando roles y permisos...");

  for (const roleName of Object.values(RoleName)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    const permissions = roleMatrix[roleName];

    // Limpia y vuelve a crear las asignaciones para que el seed sea
    // idempotente y siempre refleje exactamente la matriz de arriba.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permission,
      })),
    });

    console.log(`  ${roleName}: ${permissions.length} permisos`);
  }

  // Sucursal inicial + bodega central, para poder crear el primer
  // empleado Administrador sin depender de datos manuales.
  const branch = await prisma.branch.upsert({
    where: { id: "branch-principal" },
    update: {},
    create: {
      id: "branch-principal",
      name: "Sucursal Principal",
      targetFoodCostPercent: 30,
    },
  });

  await prisma.stockLocation.upsert({
    where: { id: "bodega-central" },
    update: {},
    create: {
      id: "bodega-central",
      type: "BODEGA_CENTRAL",
      name: "Bodega Central",
    },
  });

  await prisma.stockLocation.upsert({
    where: { id: "stock-branch-principal" },
    update: {},
    create: {
      id: "stock-branch-principal",
      type: "SUCURSAL",
      name: "Inventario - Sucursal Principal",
      branchId: branch.id,
    },
  });

  console.log("Seed completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
