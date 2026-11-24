// crypto.randomUUID() solo existe en contextos seguros (HTTPS o
// localhost) — en un despliegue de red local sin TLS (ej. la Mac del
// café sirviendo por http://192.168.x.x:3000) el navegador no lo expone
// y revienta cualquier flujo que lo use (agregar al carrito, editores de
// líneas, etc.). crypto.getRandomValues() sí está disponible fuera de
// contextos seguros, así que se arma un UUID v4 con eso como respaldo.
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
