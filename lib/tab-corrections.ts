// Corregir (quitar o reducir) un producto ya registrado en una cuenta
// abierta — removeTabItem/updateTabItemQuantity en actions/pos.ts. Dentro
// de esta ventana desde que se agregó es libre (un error de captura); pasada,
// hace falta el PIN de alguien con VENTA_CANCELAR, igual que anular.
// Vive aquí y no en el archivo "use server" (solo exporta funciones async).
export const TAB_FREE_CORRECTION_MINUTES = 5;

export const AUTHORIZATION_REQUIRED_PREFIX = "Autorización requerida:";

export function isAuthorizationRequiredError(message: string) {
  return message.startsWith(AUTHORIZATION_REQUIRED_PREFIX);
}
