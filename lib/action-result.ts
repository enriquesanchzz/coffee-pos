// Next.js oculta en producción el mensaje de cualquier Error lanzado desde
// un Server Action (el cliente solo recibe "An error occurred in the Server
// Components render..."). Por eso las acciones de actions/*.ts se envuelven
// con safeAction() (lib/safe-action.ts): en vez de lanzar, regresan este
// objeto con el mensaje en español, y el cliente lo vuelve a convertir en
// Error con withActionErrors() — así los try/catch existentes siguen
// mostrando err.message tal cual.
// redirectTo: la sesión expiró o cambió (ver SessionExpiredError en
// lib/session.ts) — el cliente navega ahí además de lanzar el error.
export type ActionError = { __actionError: string; redirectTo?: string };

export function isActionError(value: unknown): value is ActionError {
  return (
    typeof value === "object" &&
    value !== null &&
    "__actionError" in value &&
    typeof (value as ActionError).__actionError === "string"
  );
}

export function withActionErrors<A extends unknown[], R>(
  action: (...args: A) => Promise<R>
): (...args: A) => Promise<Exclude<R, ActionError>> {
  return async (...args: A) => {
    let result: R;
    try {
      result = await action(...args);
    } catch (err) {
      // fetch() rechaza con TypeError cuando no hay red ("Failed to fetch"):
      // se traduce para que el usuario sepa qué pasó y que puede reintentar
      // (los cobros reintentan con el mismo id y no se duplican).
      if (err instanceof TypeError) {
        throw new Error("Sin conexión con el servidor. Revisa la red y vuelve a intentar.");
      }
      throw err;
    }
    if (isActionError(result)) {
      if (result.redirectTo && typeof window !== "undefined") {
        window.location.assign(result.redirectTo);
      }
      throw new Error(result.__actionError);
    }
    return result as Exclude<R, ActionError>;
  };
}
