// Búsqueda tolerante para el mostrador (QA-013): sin acentos ni
// mayúsculas, y cada palabra de la consulta debe aparecer en alguno de los
// campos ("latte grande" encuentra "Latte" en la categoría "Café"...).
export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}
