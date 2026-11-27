// Alergias y restricciones de mascotas (CRM-02). La mascota tiene sus
// alergias (Pet.allergies) y cada producto lo que contiene
// (Product.allergenTags); el POS avisa cuando coinciden. Se comparan sin
// acentos ni mayúsculas ("Lácteos" = "lacteos"). Sin imports de servidor:
// lo usan el carrito y las Server Actions.

// Sugerencias al capturar, para que producto y mascota usen las mismas
// palabras (la comparación es exacta, no hay sinónimos).
export const COMMON_ALLERGENS = [
  "pollo",
  "res",
  "cerdo",
  "cordero",
  "pescado",
  "pavo",
  "huevo",
  "lácteos",
  "trigo",
  "maíz",
  "soya",
  "granos",
];

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

export function allergenKey(tag: string) {
  return tag
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Limpia una lista capturada: minúsculas, sin vacíos ni repetidos (aunque
// difieran en acentos). Lanza Error con el mensaje para el usuario.
export function normalizeAllergenTags(tags: unknown, label = "Las alergias"): string[] {
  if (tags === undefined || tags === null) return [];
  if (!Array.isArray(tags)) throw new Error(`${label}: formato inválido.`);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") throw new Error(`${label}: formato inválido.`);
    const tag = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) throw new Error(`${label}: "${tag.slice(0, 20)}…" es demasiado largo.`);
    const key = allergenKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  if (result.length > MAX_TAGS) throw new Error(`${label}: máximo ${MAX_TAGS}.`);
  return result;
}

export type AllergyConflict = {
  // Llave de la línea del carrito (o id del producto ya registrado).
  key: string;
  productName: string;
  petName: string;
  allergens: string[];
};

// Coincidencias entre las alergias de las mascotas del cliente y lo que
// contienen los productos de la cuenta. Una por mascota y producto.
export function findAllergyConflicts(
  pets: { name: string; allergies: string[] }[],
  items: { key: string; productName: string; allergenTags: string[] }[]
): AllergyConflict[] {
  const conflicts: AllergyConflict[] = [];
  for (const pet of pets) {
    if (pet.allergies.length === 0) continue;
    const petKeys = new Map(pet.allergies.map((a) => [allergenKey(a), a] as const));
    for (const item of items) {
      const allergens = item.allergenTags.filter((t) => petKeys.has(allergenKey(t))).map((t) => petKeys.get(allergenKey(t))!);
      if (allergens.length > 0) {
        conflicts.push({ key: item.key, productName: item.productName, petName: pet.name, allergens });
      }
    }
  }
  return conflicts;
}
