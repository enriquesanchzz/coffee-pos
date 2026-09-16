import { create } from "zustand";
import type { SaleOrderType, UnitOfMeasure } from "@prisma/client";
import type { CreateSaleItemInput } from "@/actions/pos";

export type CartModifier = {
  modifierOptionId: string;
  name: string;
  priceDelta: number;
};

export type CartExtraIngredient = {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  /** Vista previa — actions/pos.ts recalcula el precio real al confirmar. */
  priceDelta: number;
};

export type CartLine = {
  /** Identificador local de la línea (no es id de base de datos). */
  lineId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  unitBasePrice: number;
  modifiers: CartModifier[];
  extraIngredients: CartExtraIngredient[];
  notes: string;
  quantity: number;
};

type AddLineInput = {
  productVariantId: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  unitBasePrice: number;
  modifiers: CartModifier[];
  extraIngredients: CartExtraIngredient[];
  notes: string;
  /** Cantidad inicial de la línea — default 1 (ej. diálogo de personalizar). */
  quantity?: number;
};

function modifierSignature(modifiers: CartModifier[]) {
  return modifiers
    .map((m) => m.modifierOptionId)
    .sort()
    .join(",");
}

function extraIngredientSignature(extras: CartExtraIngredient[]) {
  return extras
    .map((e) => `${e.ingredientId}:${e.quantity}`)
    .sort()
    .join(",");
}

// Firma completa de una línea "idéntica" — una bebida con nota o extra
// libre nunca se agrupa silenciosamente con una genérica que se ve igual
// mas no lo es.
function lineSignature(line: {
  productVariantId: string;
  modifiers: CartModifier[];
  extraIngredients: CartExtraIngredient[];
  notes: string;
}) {
  return [
    line.productVariantId,
    modifierSignature(line.modifiers),
    extraIngredientSignature(line.extraIngredients),
    line.notes.trim(),
  ].join("|");
}

function lineUnitPrice(
  line: Pick<CartLine, "unitBasePrice" | "modifiers" | "extraIngredients">
) {
  return (
    line.unitBasePrice +
    line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0) +
    line.extraIngredients.reduce((sum, e) => sum + e.priceDelta, 0)
  );
}

type CartState = {
  lines: CartLine[];
  orderType: SaleOrderType;
  setOrderType: (orderType: SaleOrderType) => void;
  // Solo aplica cuando orderType = CONSUMO_LOCAL ("Mesa").
  tableNumber: string;
  setTableNumber: (tableNumber: string) => void;
  // Cuenta abierta que se está retomando (ver open-tabs-dialog.tsx) — los
  // productos del carrito son la SIGUIENTE ronda a agregarle, no una
  // venta nueva. null = venta normal de un solo paso, sin cambios.
  activeTabId: string | null;
  setActiveTabId: (activeTabId: string | null) => void;
  addLine: (input: AddLineInput) => void;
  incrementLine: (lineId: string) => void;
  decrementLine: (lineId: string) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  subtotal: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  orderType: "PARA_LLEVAR",
  setOrderType: (orderType) => set({ orderType }),
  tableNumber: "",
  setTableNumber: (tableNumber) => set({ tableNumber }),
  activeTabId: null,
  setActiveTabId: (activeTabId) => set({ activeTabId }),

  // Agrupa por variante + mismo set de modificadores/extras/nota (misma
  // "receta" exacta), sumando cantidad en vez de crear una línea duplicada.
  addLine: (input) =>
    set((state) => {
      const signature = lineSignature(input);
      const existing = state.lines.find((line) => lineSignature(line) === signature);
      const quantity = input.quantity ?? 1;

      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.lineId === existing.lineId
              ? { ...line, quantity: line.quantity + quantity }
              : line
          ),
        };
      }

      const newLine: CartLine = {
        lineId: crypto.randomUUID(),
        productVariantId: input.productVariantId,
        productName: input.productName,
        variantName: input.variantName,
        imageUrl: input.imageUrl,
        unitBasePrice: input.unitBasePrice,
        modifiers: input.modifiers,
        extraIngredients: input.extraIngredients,
        notes: input.notes,
        quantity,
      };

      return { lines: [...state.lines, newLine] };
    }),

  incrementLine: (lineId) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.lineId === lineId
          ? { ...line, quantity: line.quantity + 1 }
          : line
      ),
    })),

  decrementLine: (lineId) =>
    set((state) => ({
      lines: state.lines
        .map((line) =>
          line.lineId === lineId
            ? { ...line, quantity: line.quantity - 1 }
            : line
        )
        .filter((line) => line.quantity > 0),
    })),

  removeLine: (lineId) =>
    set((state) => ({
      lines: state.lines.filter((line) => line.lineId !== lineId),
    })),

  clear: () => set({ lines: [] }),

  subtotal: () =>
    get().lines.reduce(
      (sum, line) => sum + lineUnitPrice(line) * line.quantity,
      0
    ),
}));

export { lineUnitPrice };

// Mismo mapeo CartLine -> CreateSaleItemInput que checkout-dialog.tsx
// usa al cobrar — reusado también por "Dejar cuenta abierta"
// (openTab/addItemsToTab) para no duplicarlo.
export function cartLineToSaleItemInput(line: CartLine): CreateSaleItemInput {
  return {
    productVariantId: line.productVariantId,
    quantity: line.quantity,
    modifierOptionIds: line.modifiers.map((m) => m.modifierOptionId),
    extraIngredients: line.extraIngredients.map((e) => ({
      ingredientId: e.ingredientId,
      quantity: e.quantity,
      unit: e.unit as UnitOfMeasure,
    })),
    notes: line.notes || undefined,
  };
}
