export const MASTER_KINDS = [
  ["aguardiente", "Aguardiente"],
  ["ron", "Ron"],
  ["cerveza", "Cerveza"],
  ["whisky", "Whisky"],
  ["vino", "Vino"],
  ["mezclador", "Mezclador"],
  ["hielo", "Hielo"],
  ["snack", "Snack"],
  ["cigarrillo", "Cigarrillo"],
  ["otro", "Otro"],
] as const;

export function kindLabel(kind: string) {
  return MASTER_KINDS.find(([value]) => value === kind)?.[1] ?? kind;
}
