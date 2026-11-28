"use client";

import { useSyncExternalStore } from "react";

// ¿Pantalla de tablet o más (≥ md, 768 px)? Decide dónde va la barra de la
// orden: arriba del catálogo (tablet/escritorio) o dentro de la hoja de la
// cuenta (celular). null mientras no se sabe (render del servidor e
// hidratación): así se monta una sola copia, nunca dos (ids duplicados).
const QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsTabletUp(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => null
  );
}
