import { create } from "zustand";

export type CartModifier = {
  modifierOptionId: string;
  name: string;
  priceDelta: number;
};

export type CartLine = {
  /** Identificador local de la línea (no es id de base de datos). */
  lineId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  unitBasePrice: number;
  modifiers: CartModifier[];
  quantity: number;
};

type AddLineInput = {
  productVariantId: string;
  productName: string;
  variantName: string;
  unitBasePrice: number;
  modifiers: CartModifier[];
};

function modifierSignature(modifiers: CartModifier[]) {
  return modifiers
    .map((m) => m.modifierOptionId)
    .sort()
    .join(",");
}

function lineUnitPrice(line: Pick<CartLine, "unitBasePrice" | "modifiers">) {
  return (
    line.unitBasePrice +
    line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0)
  );
}

type CartState = {
  lines: CartLine[];
  addLine: (input: AddLineInput) => void;
  incrementLine: (lineId: string) => void;
  decrementLine: (lineId: string) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  subtotal: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],

  // Agrupa por variante + mismo set de modificadores (misma "receta"
  // exacta), sumando cantidad en vez de crear una línea duplicada.
  addLine: (input) =>
    set((state) => {
      const signature = modifierSignature(input.modifiers);
      const existing = state.lines.find(
        (line) =>
          line.productVariantId === input.productVariantId &&
          modifierSignature(line.modifiers) === signature
      );

      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.lineId === existing.lineId
              ? { ...line, quantity: line.quantity + 1 }
              : line
          ),
        };
      }

      const newLine: CartLine = {
        lineId: crypto.randomUUID(),
        productVariantId: input.productVariantId,
        productName: input.productName,
        variantName: input.variantName,
        unitBasePrice: input.unitBasePrice,
        modifiers: input.modifiers,
        quantity: 1,
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
