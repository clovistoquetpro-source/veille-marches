import type postgres from "postgres";
import { JOURS_ESSAI } from "./produit";

export type Abonnement = {
  compte_id: string;
  statut: "essai" | "actif" | "en_retard" | "resilie";
  fin_essai: string | null;
  client_stripe: string | null;
  abonnement_stripe: string | null;
  fin_periode: string | null;
};

/** Ouvre l'essai gratuit d'un nouveau compte. Ne touche à rien si le compte en a déjà un. */
export async function ouvrirEssai(sql: postgres.Sql, compteId: string): Promise<void> {
  await sql`
    insert into abonnements (compte_id, statut, fin_essai)
    values (${compteId}, 'essai', (current_date + ${JOURS_ESSAI}::integer))
    on conflict (compte_id) do nothing`;
}

export async function abonnementDuCompte(sql: postgres.Sql, compteId: string): Promise<Abonnement | null> {
  const [ligne] = await sql<Abonnement[]>`
    select compte_id, statut, fin_essai::text as fin_essai, client_stripe, abonnement_stripe,
      fin_periode::text as fin_periode
    from abonnements where compte_id = ${compteId}`;
  return ligne ?? null;
}

/** Vrai tant que le client a accès au service : abonnement actif, ou essai en cours. */
export function accesOuvert(abonnement: Abonnement | null): boolean {
  if (!abonnement) return false;
  if (abonnement.statut === "actif" || abonnement.statut === "en_retard") return true;
  return abonnement.statut === "essai" && abonnement.fin_essai !== null
    && abonnement.fin_essai >= new Date().toISOString().slice(0, 10);
}

/** Jours d'essai restants, ou null si le compte n'est pas en essai. */
export function joursDEssai(abonnement: Abonnement | null): number | null {
  if (!abonnement || abonnement.statut !== "essai" || !abonnement.fin_essai) return null;
  const fin = new Date(`${abonnement.fin_essai}T00:00:00Z`).getTime();
  const aujourdhui = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((fin - aujourdhui) / 86_400_000));
}

/** Enregistre ce que Stripe nous apprend d'un abonnement. */
export async function majAbonnement(
  sql: postgres.Sql,
  compteId: string,
  maj: {
    statut: Abonnement["statut"];
    client_stripe?: string | null;
    abonnement_stripe?: string | null;
    fin_periode?: string | null;
  },
): Promise<void> {
  await sql`
    insert into abonnements (compte_id, statut, client_stripe, abonnement_stripe, fin_periode)
    values (${compteId}, ${maj.statut}, ${maj.client_stripe ?? null}, ${maj.abonnement_stripe ?? null},
      ${maj.fin_periode ?? null})
    on conflict (compte_id) do update set
      statut = excluded.statut,
      client_stripe = coalesce(excluded.client_stripe, abonnements.client_stripe),
      abonnement_stripe = coalesce(excluded.abonnement_stripe, abonnements.abonnement_stripe),
      fin_periode = coalesce(excluded.fin_periode, abonnements.fin_periode),
      maj_le = now()`;
}

/** Compte rattaché à un abonnement Stripe, pour traiter les événements qui n'ont pas notre identifiant. */
export async function compteDeLAbonnementStripe(
  sql: postgres.Sql,
  abonnementStripe: string,
): Promise<string | null> {
  const [ligne] = await sql<{ compte_id: string }[]>`
    select compte_id from abonnements where abonnement_stripe = ${abonnementStripe}`;
  return ligne?.compte_id ?? null;
}
