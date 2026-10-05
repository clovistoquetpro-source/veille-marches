import type postgres from "postgres";

/** Titulaire d'un marché, avec son nom Sirene quand on le connaît. */
export type TitulaireMarche = { id: string; siren: string | null; nom: string | null };

export type Renouvellement = {
  uid: string;
  objet: string | null;
  acheteur: string;
  acheteur_nom: string | null;
  famille: "fournitures" | "services";
  cpv: string | null;
  montant: number | null;
  date_fin_estimee: string;
  duree_mois: number;
  offres_recues: number | null;
  titulaires: TitulaireMarche[];
  /** Un marché similaire du même acheteur a été notifié depuis : la relance a sans doute déjà eu lieu. */
  deja_relance_le: string | null;
};

export type FiltresRenouvellements = {
  /** Département du lieu d'exécution, par exemple "69" ou "2A". */
  departement?: string;
  /** Premiers chiffres du code CPV, par exemple "90" pour les services d'assainissement et de nettoyage. */
  cpv?: string;
  limite?: number;
};

/** Titulaires d'un marché en JSON, à utiliser dans une sous-requête (`marche_uid` = colonne uid). */
export function titulairesJson(sql: postgres.Sql, uid: postgres.Fragment) {
  return sql`coalesce((
    select json_agg(json_build_object('id', t.titulaire_id, 'siren', t.siren, 'nom', te.nom) order by t.titulaire_id)
    from marches_titulaires t
    left join entreprises te on te.siren = t.siren
    where t.marche_uid = ${uid}
  ), '[]')`;
}

/** Marchés de services et fournitures qui arrivent à échéance dans les 12 mois, les plus proches d'abord. */
export async function listerRenouvellements(
  sql: postgres.Sql,
  { departement, cpv, limite = 100 }: FiltresRenouvellements = {},
): Promise<Renouvellement[]> {
  return sql<Renouvellement[]>`
    select r.uid, r.objet, r.acheteur_siret as acheteur, coalesce(e.nom, a.nom) as acheteur_nom, r.famille,
      r.cpv, r.montant::float as montant, r.date_fin_estimee::text as date_fin_estimee, r.duree_mois,
      r.offres_recues, r.deja_relance_le::text as deja_relance_le,
      ${titulairesJson(sql, sql`r.uid`)} as titulaires
    from renouvellements r
    left join acheteurs a on a.siret = r.acheteur_siret
    left join entreprises e on e.siren = left(r.acheteur_siret, 9)
    where true
      ${departement ? sql`and r.departement = ${departement}` : sql``}
      ${cpv ? sql`and r.cpv like ${cpv + "%"}` : sql``}
    order by r.date_fin_estimee, r.montant desc nulls last
    limit ${limite}`;
}
