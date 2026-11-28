import { create } from "zustand";
import type { DomicilioOrigen } from "@prisma/client";
import type { CustomerOption } from "@/lib/customers";

// Cliente y domicilio de la orden en curso. Antes vivían en CartPanel; ahora
// los comparten la barra de la orden (arriba del catálogo, OrderBar), la
// cuenta y el cobro. A propósito NO se persiste (a diferencia del carrito,
// cart-store.ts): son datos personales y se eligen de nuevo al recargar.
type OrderCustomerState = {
  selectedCustomer: CustomerOption | null;
  domicilioAddress: string;
  domicilioOrigen: DomicilioOrigen;
  setSelectedCustomer: (customer: CustomerOption | null) => void;
  setDomicilioAddress: (address: string) => void;
  setDomicilioOrigen: (origen: DomicilioOrigen) => void;
  resetOrderCustomer: () => void;
};

export const useOrderCustomerStore = create<OrderCustomerState>()((set) => ({
  selectedCustomer: null,
  domicilioAddress: "",
  domicilioOrigen: "TELEFONO",
  setSelectedCustomer: (selectedCustomer) => set({ selectedCustomer }),
  setDomicilioAddress: (domicilioAddress) => set({ domicilioAddress }),
  setDomicilioOrigen: (domicilioOrigen) => set({ domicilioOrigen }),
  resetOrderCustomer: () => set({ selectedCustomer: null, domicilioAddress: "", domicilioOrigen: "TELEFONO" }),
}));
