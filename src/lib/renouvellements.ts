import type postgres from "postgres";

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
  titulaires: string[];
};

export type FiltresRenouvellements = {
  /** Département du lieu d'exécution, par exemple "69" ou "2A". */
  departement?: string;
  /** Premiers chiffres du code CPV, par exemple "90" pour les services d'assainissement et de nettoyage. */
  cpv?: string;
  limite?: number;
};

/** Marchés de services et fournitures qui arrivent à échéance dans les 12 mois, les plus proches d'abord. */
export async function listerRenouvellements(
  sql: postgres.Sql,
  { departement, cpv, limite = 100 }: FiltresRenouvellements = {},
): Promise<Renouvellement[]> {
  return sql<Renouvellement[]>`
    select r.uid, r.objet, r.acheteur_siret as acheteur, a.nom as acheteur_nom, r.famille, r.cpv,
      r.montant::float as montant, r.date_fin_estimee::text as date_fin_estimee, r.duree_mois,
      r.offres_recues,
      coalesce(array_agg(t.titulaire_id order by t.titulaire_id) filter (where t.titulaire_id is not null), '{}') as titulaires
    from renouvellements r
    left join acheteurs a on a.siret = r.acheteur_siret
    left join marches_titulaires t on t.marche_uid = r.uid
    where true
      ${departement ? sql`and r.departement = ${departement}` : sql``}
      ${cpv ? sql`and r.cpv like ${cpv + "%"}` : sql``}
    group by r.uid, r.objet, r.acheteur_siret, a.nom, r.famille, r.cpv, r.montant, r.date_fin_estimee,
      r.duree_mois, r.offres_recues
    order by r.date_fin_estimee, r.montant desc nulls last
    limit ${limite}`;
}
