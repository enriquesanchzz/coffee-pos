"use client";

import { createContext, useContext } from "react";

// Nivel de título de las tarjetas de ajustes: h3 dentro de Configuración
// (debajo del h2 de la sección); h2 cuando la página no tiene ese nivel
// intermedio (Clientes → Lealtad, Inventario → Ajustes).
const SettingsHeadingContext = createContext<"h2" | "h3">("h3");

export function SettingsHeadingLevel({ level, children }: { level: "h2" | "h3"; children: React.ReactNode }) {
  return <SettingsHeadingContext.Provider value={level}>{children}</SettingsHeadingContext.Provider>;
}

export function useSettingsHeading() {
  return useContext(SettingsHeadingContext);
}
