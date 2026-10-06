/** Mise en forme des montants, dates et nombres pour l'affichage. */

const formatEuros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const formatNombre = new Intl.NumberFormat("fr-FR");
const formatMois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const formatJour = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" });

export function euros(montant: number | string | null | undefined): string {
  if (montant === null || montant === undefined || montant === "") return "?";
  const n = Number(montant);
  if (!Number.isFinite(n)) return "?";
  if (n >= 1e6) return `${formatNombre.format(Math.round(n / 1e5) / 10)} M€`;
  return formatEuros.format(n);
}

export function nombre(n: number | string | null | undefined): string {
  return n === null || n === undefined ? "?" : formatNombre.format(Number(n));
}

/** « octobre 2026 » ; les dates de la base arrivent en texte AAAA-MM-JJ. */
export function mois(date: string | null): string {
  return date ? formatMois.format(new Date(`${date.slice(0, 10)}T00:00:00Z`)) : "?";
}

/** « 02/10/2026 ». */
export function jour(date: string | null): string {
  return date ? formatJour.format(new Date(`${date.slice(0, 10)}T00:00:00Z`)) : "?";
}
