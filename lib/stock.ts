// Prefijo del error de insumos insuficientes que lanzan las acciones del
// POS (ver findShortages en actions/pos.ts). Vive aquí y no en el archivo
// "use server" porque ese solo puede exportar funciones async; el cliente
// lo usa para reconocer el error y ofrecer "vender de todos modos".
export const SHORTAGE_ERROR_PREFIX = "Insumos insuficientes:";

export function isShortageError(message: string) {
  return message.startsWith(SHORTAGE_ERROR_PREFIX);
}
