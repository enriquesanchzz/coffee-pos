import "server-only";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@prisma/client";
import type { ActionError } from "./action-result";
import { SessionExpiredError } from "./session";
import { syncAppTimeZone } from "./settings";

// Ver lib/action-result.ts. Los errores de negocio (throw new Error("...")
// en español) se regresan con su mensaje; los de Prisma u otros inesperados
// se traducen a un mensaje genérico para no filtrar detalles internos.
// redirect()/notFound() se vuelven a lanzar para que Next los maneje.
export function safeAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>
): (...args: A) => Promise<R | ActionError> {
  return async (...args: A) => {
    try {
      // Zona horaria de Configuración → Negocio antes de cualquier cálculo
      // de fechas/horarios dentro de la acción.
      await syncAppTimeZone();
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

// Mensajes en lenguaje del negocio para las restricciones únicas (QA-024)
// — antes se mostraba el nombre técnico de la columna.
const UNIQUE_MESSAGES: Record<string, string> = {
  "Employee:email": "Ya hay un empleado con ese email.",
  "Customer:email": "Ya hay un cliente con ese email.",
  "Customer:phone": "Ya hay un cliente con ese teléfono.",
  "DiscountCode:code": "Ya existe un código de descuento con ese nombre.",
  "IngredientCategory:name": "Ya existe una categoría de insumos con ese nombre.",
  "ProductCategory:name": "Ya existe una categoría de productos con ese nombre.",
  "LoyaltyTier:name": "Ya existe un nivel de lealtad con ese nombre.",
  "IngredientSupplier:ingredientId,supplierId": "Ese insumo ya está ligado a este proveedor.",
  "PromotionVariant:promotionId,productVariantId": "Ese producto ya está en la promoción.",
};

function uniqueMessage(model: string | undefined, fields: string): string {
  const exact = model ? UNIQUE_MESSAGES[`${model}:${fields}`] : undefined;
  if (exact) return exact;
  // Sin modelName (versiones viejas de Prisma) se busca solo por campos.
  const byField = Object.entries(UNIQUE_MESSAGES).find(([key]) => key.endsWith(`:${fields}`));
  if (byField && fields) return byField[1];
  return "Ya existe un registro con esos datos.";
}

function toUserMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | string | undefined) ?? "";
      const fields = Array.isArray(target) ? target.join(",") : target;
      const model = err.meta?.modelName as string | undefined;
      return uniqueMessage(model, fields);
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
