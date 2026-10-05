// Next.js oculta en producción el mensaje de cualquier Error lanzado desde
// un Server Action (el cliente solo recibe "An error occurred in the Server
// Components render..."). Por eso las acciones de actions/*.ts se envuelven
// con safeAction() (lib/safe-action.ts): en vez de lanzar, regresan este
// objeto con el mensaje en español, y el cliente lo vuelve a convertir en
// Error con withActionErrors() — así los try/catch existentes siguen
// mostrando err.message tal cual.
export type ActionError = { __actionError: string };

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
    const result = await action(...args);
    if (isActionError(result)) {
      throw new Error(result.__actionError);
    }
    return result as Exclude<R, ActionError>;
  };
}
