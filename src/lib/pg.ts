/**
 * Littéral PostgreSQL d'un tableau de texte. Sans introspection des types (`fetch_types: false`,
 * nécessaire derrière le pooler de Supabase), postgres.js ne sait pas encoder les tableaux lui-même.
 */
export function tableauPg(valeurs: string[]): string {
  return `{${valeurs.map((v) => `"${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}
