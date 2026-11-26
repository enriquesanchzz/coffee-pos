import { PrismaClient } from "@prisma/client";
import { awardSalePoints } from "../lib/loyalty-points";

// Conversión única de sellos → puntos (migración 20261125100000_loyalty_points).
// En vez de traducir sellos con una tasa arbitraria, se recalculan los
// puntos de cada cliente desde su historial real de compras cobradas, con
// las tasas de Configuración → Lealtad.
//
// - Los movimientos quedan como CONVERSION, ligados a su venta.
// - Los niveles alcanzados quedan registrados, pero NO se regalan cupones
//   de un uso por compras pasadas; el descuento permanente del nivel sí
//   queda activo.
// - Idempotente POR VENTA: una venta que ya dio puntos (en vivo o en una
//   corrida anterior interrumpida) se salta, así que se puede repetir.
//
// Uso: npm run loyalty:convert
const prisma = new PrismaClient();

async function main() {
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETADA", customerId: { not: null }, loyaltyEntries: { none: {} } },
    select: { id: true, customerId: true },
    orderBy: { createdAt: "asc" },
  });

  let converted = 0;
  for (const sale of sales) {
    const done = await prisma.$transaction(
      async (tx) => {
        // FOR UPDATE: si una anulación de esta venta va a la mitad, se espera
        // y se ve CANCELADA, en vez de darle puntos que nadie revertiría.
        const [current] = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "sales" WHERE "id" = ${sale.id} FOR UPDATE`;
        if (current?.status !== "COMPLETADA") return false; // se anuló mientras corría
        return awardSalePoints(tx, sale.id, sale.customerId!, { reason: "CONVERSION", issueOneTimeRewards: false });
      },
      { timeout: 20_000 }
    );
    if (done) converted += 1;
  }

  const balances = await prisma.loyaltyBalance.findMany({
    include: { customer: { select: { name: true } } },
    orderBy: [{ customer: { name: "asc" } }, { program: "asc" }],
  });
  console.log(`${converted} ventas convertidas.`);
  for (const b of balances) console.log(`  ${b.customer.name} · ${b.program}: ${b.points} pts`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
