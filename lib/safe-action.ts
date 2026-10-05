import "server-only";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@prisma/client";
import type { ActionError } from "./action-result";
import { SessionExpiredError } from "./session";

// Ver lib/action-result.ts. Los errores de negocio (throw new Error("...")
// en español) se regresan con su mensaje; los de Prisma u otros inesperados
// se traducen a un mensaje genérico para no filtrar detalles internos.
// redirect()/notFound() se vuelven a lanzar para que Next los maneje.
export function safeAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>
): (...args: A) => Promise<R | ActionError> {
  return async (...args: A) => {
    try {
      return await action(...args);
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof SessionExpiredError) {
        return { __actionError: err.message, redirectTo: err.redirectTo };
      }
      return { __actionError: toUserMessage(err) };
    }
  };
}

function toUserMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | string | undefined) ?? "";
      const fields = Array.isArray(target) ? target.join(", ") : target;
      return fields
        ? `Ya existe un registro con ese valor (${fields}).`
        : "Ya existe un registro con esos datos.";
    }
    if (err.code === "P2025") {
      return "El registro ya no existe o fue modificado por alguien más.";
    }
    console.error(err);
    return "Ocurrió un error al guardar en la base de datos. Intenta de nuevo.";
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error(err);
    return "Datos inválidos. Revisa la información capturada.";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  console.error(err);
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}
