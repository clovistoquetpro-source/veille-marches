import type postgres from "postgres";
import { normaliserDepartement } from "../ingest/departements";
import { tableauPg } from "./pg";

/** Ce qu'un client veut suivre. Les codes CPV sont des préfixes : « 90 », « 90910 », « 90911300 ». */
export type Profil = {
  cpv: string[];
  mots_cles: string[];
  departements: string[];
  /** Marchés déjà gagnés, déduction par l'IA, ou saisie à la main. */
  origine: "historique" | "ia" | "manuel";
  /** Rythme des alertes par courriel. */
  frequence?: "quotidienne" | "hebdomadaire" | "aucune";
};

/** Ce que la base sait d'une entreprise avant de lui proposer un profil. */
export type HistoriqueEntreprise = {
  siren: string;
  nom: string | null;
  naf: string | null;
  naf_libelle: string | null;
  marches: number;
  /** Classes CPV (5 chiffres) de ses marchés, la plus fréquente d'abord. */
  cpv: { code: string; marches: number }[];
  departements: { code: string; marches: number }[];
  /** Nombre de départements où elle a gagné : au-delà de 5, on ne propose aucun filtre de secteur. */
  nb_departements: number;
  /** Objets de ses derniers marchés, pour donner des exemples à l'IA. */
  objets: string[];
};

const MOTS_VIDES = new Set([
  "autres", "activites", "activités", "divers", "classees", "classées", "ailleurs", "nca", "non",
  "pour", "avec", "sans", "dans", "leurs", "leur", "des", "les", "une", "aux", "sur", "par", "et",
  "de", "du", "la", "le", "en", "au", "ou", "biens", "services", "produits", "travaux", "general",
  "général", "generale", "générale", "specialisee", "spécialisée", "specialises", "spécialisés",
]);

/** Ce que la base sait de l'entreprise : ses marchés gagnés, ses acheteurs, son activité Sirene. */
export async function historiqueEntreprise(sql: postgres.Sql, siren: string): Promise<HistoriqueEntreprise> {
  const [ligne] = await sql<HistoriqueEntreprise[]>`
    with gagnes as (
      select m.* from marches m
      join marches_titulaires t on t.marche_uid = m.uid and t.siren = ${siren}
    )
    select
      ${siren}::text as siren,
      (select nom from entreprises where siren = ${siren}) as nom,
      (select naf from entreprises where siren = ${siren}) as naf,
      (select n.libelle from entreprises e join naf n on n.code = e.naf where e.siren = ${siren}) as naf_libelle,
      (select count(*)::int from gagnes) as marches,
      coalesce((
        select json_agg(x) from (
          select left(cpv, 5) as code, count(*)::int as marches from gagnes
          where cpv is not null group by 1 order by 2 desc, 1 limit 8
        ) x), '[]') as cpv,
      coalesce((
        select json_agg(x) from (
          select departement as code, count(*)::int as marches from gagnes
          where departement is not null group by 1 order by 2 desc, 1 limit 6
        ) x), '[]') as departements,
      (select count(distinct departement)::int from gagnes where departement is not null) as nb_departements,
      coalesce((
        select json_agg(objet) from (
          select objet from gagnes where objet is not null order by date_notification desc limit 10
        ) o), '[]') as objets`;
  return ligne;
}

/**
 * Profil proposé à partir des marchés déjà gagnés : on garde les classes CPV qui reviennent et les
 * départements des acheteurs. Renvoie null quand l'entreprise n'a pas assez d'historique public.
 */
export function profilDepuisHistorique(h: HistoriqueEntreprise): Profil | null {
  if (h.marches < 3 || h.cpv.length === 0) return null;
  // on écarte la longue traîne : les classes vues une seule fois quand l'entreprise en a plusieurs
  const retenus = h.cpv.filter((c) => c.marches > 1);
  const cpv = (retenus.length > 0 ? retenus : h.cpv).slice(0, 6).map((c) => c.code);
  // une entreprise qui a déjà gagné dans plus de cinq départements répond partout : pas de filtre
  const departements = h.nb_departements > 5
    ? []
    : h.departements.map((d) => d.code);
  return { cpv, mots_cles: [], departements, origine: "historique" };
}

/** Profil de repli : les mots significatifs de l'activité Sirene, à corriger par le client. */
export function profilDepuisNaf(libelle: string | null): Profil {
  const mots = [...new Set(
    (libelle ?? "").toLowerCase().split(/[^\p{L}]+/u).filter((m) => m.length >= 5 && !MOTS_VIDES.has(m)),
  )].slice(0, 4);
  return { cpv: [], mots_cles: mots, departements: [], origine: "manuel" };
}

/** Garde ce qui est exploitable : préfixes CPV de 2 à 8 chiffres, mots-clés courts, départements connus. */
export function nettoyerProfil(profil: Partial<Profil>): Omit<Profil, "origine"> {
  // « 90910000-9 » : le chiffre après le tiret est une clé de contrôle, le code CPV fait 8 chiffres
  const cpv = [...new Set((profil.cpv ?? []).map((c) => String(c).replace(/\D/g, "").slice(0, 8)))]
    .filter((c) => c.length >= 2)
    .slice(0, 12);
  const mots_cles = [...new Set((profil.mots_cles ?? []).map((m) => String(m).trim().toLowerCase()))]
    .filter((m) => m.length >= 3 && m.length <= 40)
    .slice(0, 10);
  const departements = [...new Set(
    (profil.departements ?? []).map((d) => normaliserDepartement(String(d))).filter((d) => d !== null),
  )].slice(0, 20);
  return { cpv, mots_cles, departements };
}

/** Profil enregistré d'un compte. */
export async function profilDuCompte(sql: postgres.Sql, compteId: string): Promise<Profil | null> {
  const [ligne] = await sql<Profil[]>`
    select array_to_json(cpv) as cpv, array_to_json(mots_cles) as mots_cles,
      array_to_json(departements) as departements, origine, frequence
    from profils where compte_id = ${compteId}`;
  return ligne ?? null;
}

/** Crée ou remplace le profil d'un compte. */
export async function enregistrerProfil(sql: postgres.Sql, compteId: string, profil: Profil): Promise<void> {
  const { cpv, mots_cles, departements } = nettoyerProfil(profil);
  await sql`
    insert into profils (compte_id, cpv, mots_cles, departements, origine, frequence)
    values (${compteId}, ${tableauPg(cpv)}, ${tableauPg(mots_cles)}, ${tableauPg(departements)},
      ${profil.origine}, ${profil.frequence ?? "quotidienne"})
    on conflict (compte_id) do update set
      cpv = excluded.cpv, mots_cles = excluded.mots_cles, departements = excluded.departements,
      origine = excluded.origine, frequence = excluded.frequence, maj_le = now()`;
}
