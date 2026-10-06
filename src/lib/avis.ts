import type postgres from "postgres";

export type AvisResume = {
  uid: string;
  source: "boamp" | "ted";
  type: string;
  objet: string;
  acheteur_nom: string | null;
  acheteur_siret: string | null;
  cpv: string | null;
  departements: string[];
  date_publication: string;
  date_limite: string | null;
  montant: number | null;
  url: string;
  titulaires: { nom: string | null; siren: string | null }[];
};

export type FiltresAvis = {
  departement?: string;
  /** Type d'avis : "marche" (appels d'offres en cours), "attribution"… */
  type?: string;
  cpv?: string;
  /** Mots cherchés dans l'objet et le nom de l'acheteur. */
  texte?: string;
  limite?: number;
};

/** Derniers avis publiés, du plus récent au plus ancien. Les rectificatifs sont exclus par défaut. */
export async function listerAvis(
  sql: postgres.Sql,
  { departement, type, cpv, texte, limite = 100 }: FiltresAvis = {},
): Promise<AvisResume[]> {
  const mots = (texte ?? "").split(/\s+/).filter((m) => m.length >= 2).slice(0, 5);
  return sql<AvisResume[]>`
    select av.uid, av.source, av.type, av.objet, av.acheteur_nom, av.acheteur_siret, av.cpv,
      array_to_json(av.departements) as departements, av.date_publication::text as date_publication,
      av.date_limite::text as date_limite, av.montant::float as montant, av.url,
      coalesce((select json_agg(json_build_object('nom', coalesce(e.nom, t.nom), 'siren', t.siren) order by t.rang)
        from avis_titulaires t left join entreprises e on e.siren = t.siren
        where t.avis_uid = av.uid), '[]') as titulaires
    from avis av
    where ${type ? sql`av.type = ${type}` : sql`av.type <> 'rectificatif'`}
      ${departement ? sql`and av.departements @> array[${departement}]::text[]` : sql``}
      ${cpv ? sql`and av.cpv like ${cpv + "%"}` : sql``}
      ${mots.reduce(
        (filtre, mot) => sql`${filtre} and (av.objet ilike ${"%" + mot + "%"} or av.acheteur_nom ilike ${"%" + mot + "%"})`,
        sql``,
      )}
    order by av.date_publication desc, av.uid desc
    limit ${limite}`;
}
