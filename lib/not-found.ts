import "server-only";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

// Para páginas de detalle (/clientes/[id], /compras/[id], ...): un id que
// no existe debe dar 404, no un 500. Los getters de lib/ usan
// findUniqueOrThrow (Prisma P2025) o regresan null — ambos casos terminan
// en notFound(); cualquier otro error se propaga tal cual.
export async function orNotFound<T>(promise: Promise<T>): Promise<NonNullable<T>> {
  let value: T;
  try {
    value = await promise;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      notFound();
    }
    throw err;
  }
  if (value === null || value === undefined) {
    notFound();
  }
  return value as NonNullable<T>;
}
