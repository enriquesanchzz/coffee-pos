import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

// Acento visual usado solo en components/pos/* (reskin al estilo del
// mockup de referencia) — deliberadamente no se toca la variable global
// --primary en app/globals.css para no afectar el resto de la app
// (Compras, Reportes, Administración, etc.).
export const posAccentClass = "bg-orange-500 text-white hover:bg-orange-500/90";
export const posAccentBorderClass = "border-orange-500 bg-orange-500 text-white";
