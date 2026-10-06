/**
 * Ce qu'un profil de veille fait remonter : les avis en cours et les marchés qui arrivent à échéance.
 * Un avis correspond quand son code CPV commence par l'un des préfixes suivis ou que son objet
 * contient l'un des mots-clés, et, si le client a choisi des départements, qu'il s'exécute dans l'un
 * d'eux. Les mêmes règles serviront aux alertes par courriel.
 */
import type postgres from "postgres";
import type { AvisResume } from "./avis";
import { tableauPg } from "./pg";
import type { Profil } from "./profil";
import { titulairesJson, type Renouvellement } from "./renouvellements";

/** Un profil sans code CPV ni mot-clé ne remonte rien : on ne veut pas noyer le client. */
export function profilVide(profil: Profil): boolean {
  return profil.cpv.length === 0 && profil.mots_cles.length === 0;
}

/** `cpv like 'X%' or objet ilike '%mot%'…`, pour les tables qui ont une colonne `cpv` et une colonne d'objet. */
function criteres(sql: postgres.Sql, profil: Profil, cpv: postgres.Fragment, objet: postgres.Fragment) {
  const liste = [
    ...profil.cpv.map((c) => sql`${cpv} like ${c + "%"}`),
    ...profil.mots_cles.map((m) => sql`${objet} ilike ${"%" + m + "%"}`),
  ];
  return liste.reduce((a, b) => sql`${a} or ${b}`);
}

/** Avis en cours qui correspondent au profil, les plus récents d'abord. */
export async function avisDuProfil(sql: postgres.Sql, profil: Profil, limite = 50): Promise<AvisResume[]> {
  if (profilVide(profil)) return [];
  return sql<AvisResume[]>`
    select av.uid, av.source, av.type, av.objet, av.acheteur_nom, av.acheteur_siret, av.cpv,
      array_to_json(av.departements) as departements, av.date_publication::text as date_publication,
      av.date_limite::text as date_limite, av.montant::float as montant, av.url, '[]'::json as titulaires
    from avis av
    where av.type in ('marche', 'preinformation')
      and (av.date_limite is null or av.date_limite >= current_date)
      and (${criteres(sql, profil, sql`av.cpv`, sql`av.objet`)})
      ${profil.departements.length > 0
        ? sql`and av.departements && ${tableauPg(profil.departements)}::text[]`
        : sql``}
    order by av.date_publication desc, av.uid desc
    limit ${limite}`;
}

/** Marchés qui arrivent à échéance et qui correspondent au profil, les plus proches d'abord. */
export async function renouvellementsDuProfil(
  sql: postgres.Sql,
  profil: Profil,
  limite = 50,
): Promise<Renouvellement[]> {
  if (profilVide(profil)) return [];
  return sql<Renouvellement[]>`
    select r.uid, r.objet, r.acheteur_siret as acheteur, coalesce(e.nom, a.nom) as acheteur_nom, r.famille,
      r.cpv, r.montant::float as montant, r.date_fin_estimee::text as date_fin_estimee, r.duree_mois,
      r.offres_recues, r.deja_relance_le::text as deja_relance_le,
      ${titulairesJson(sql, sql`r.uid`)} as titulaires
    from renouvellements r
    left join acheteurs a on a.siret = r.acheteur_siret
    left join entreprises e on e.siren = left(r.acheteur_siret, 9)
    where (${criteres(sql, profil, sql`r.cpv`, sql`r.objet`)})
      ${profil.departements.length > 0 ? sql`and r.departement = any(${tableauPg(profil.departements)}::text[])` : sql``}
    order by r.date_fin_estimee, r.montant desc nulls last
    limit ${limite}`;
}
