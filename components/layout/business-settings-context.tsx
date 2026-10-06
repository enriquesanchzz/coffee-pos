"use client";

import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS, type BusinessSettings } from "@/lib/settings-shared";

// Ajustes de Configuración disponibles en cualquier componente cliente
// (propinas, métodos de pago, nombre del negocio, sellos…). Los carga
// app/layout.tsx en cada request; el servidor siempre vuelve a validar con
// lib/settings.ts, esto es solo para mostrar y prellenar.
const BusinessSettingsContext = createContext<BusinessSettings>(DEFAULT_SETTINGS);

export function BusinessSettingsProvider({
  value,
  children,
}: {
  value: BusinessSettings;
  children: React.ReactNode;
}) {
  return <BusinessSettingsContext.Provider value={value}>{children}</BusinessSettingsContext.Provider>;
}

export function useBusinessSettings() {
  return useContext(BusinessSettingsContext);
}
