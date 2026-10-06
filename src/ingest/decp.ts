/**
 * Import des DECP (données essentielles de la commande publique).
 *
 * Deux jeux publiés par data.economie.gouv.fr couvrent toute la période :
 * - decp-v3-marches-valides : ancien format (arrêté 2019), marchés notifiés de 2018 à 2023 ;
 * - decp-2022-marches-valides : nouveau format (arrêté 2022), de 2023 à aujourd'hui.
 * On les télécharge en parquet, puis DuckDB les fusionne et les nettoie en fichiers CSV prêts à charger.
 */
import type { DuckDBConnection } from "@duckdb/node-api";

const API = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets";

const COLONNES_COMMUNES = [
  "id", "acheteur_id", "objet", "codecpv", "nature", "procedure", "montant",
  "datenotification", "dureemois", "offresrecues", "lieuexecution_code", "lieuexecution_typecode", "source",
  "titulaire_id_1", "titulaire_typeidentifiant_1",
  "titulaire_id_2", "titulaire_typeidentifiant_2",
  "titulaire_id_3", "titulaire_typeidentifiant_3",
];

export const JEUX_DECP = {
  "2019": {
    jeu: "decp-v3-marches-valides",
    colonnes: [...COLONNES_COMMUNES, "acheteur_nom"],
  },
  "2022": {
    jeu: "decp-2022-marches-valides",
    colonnes: COLONNES_COMMUNES,
  },
} as const;

export type FormatDecp = keyof typeof JEUX_DECP;

export function urlExport(format: FormatDecp): string {
  const { jeu, colonnes } = JEUX_DECP[format];
  return `${API}/${jeu}/exports/parquet?select=${colonnes.join(",")}`;
}

/**
 * Département d'exécution déduit du lieu publié, qui peut être un code postal, un code commune ou un
 * code département. Corse : codes postaux 200xx-201xx pour la Corse-du-Sud, 202xx-209xx pour la Haute-Corse.
 */
const DEPARTEMENT = `
  case
    when lower(lieuexecution_typecode) like '%partement%' then
      case
        when trim(lieuexecution_code::varchar) ~ '^\\d$' then '0' || trim(lieuexecution_code::varchar)
        when upper(trim(lieuexecution_code::varchar)) ~ '^(\\d{2}|2A|2B|97\\d)$' then upper(trim(lieuexecution_code::varchar))
      end
    when regexp_matches(lower(lieuexecution_typecode), 'postal|commune') then
      case
        when upper(trim(lieuexecution_code::varchar)) ~ '^2[AB]\\d{3}$' then left(upper(trim(lieuexecution_code::varchar)), 2)
        when trim(lieuexecution_code::varchar) ~ '^9[78]\\d{3}$' then left(trim(lieuexecution_code::varchar), 3)
        when lower(lieuexecution_typecode) like '%postal%' and trim(lieuexecution_code::varchar) ~ '^20[01]\\d{2}$' then '2A'
        when lower(lieuexecution_typecode) like '%postal%' and trim(lieuexecution_code::varchar) ~ '^20\\d{3}$' then '2B'
        when trim(lieuexecution_code::varchar) ~ '^\\d{5}$' then left(trim(lieuexecution_code::varchar), 2)
      end
  end`;

/**
 * Identifiant de titulaire nettoyé. L'ancien format stocke parfois le SIRET comme un nombre : les zéros
 * de tête sont perdus. « CDL » est une valeur de remplissage du nouveau format quand il n'y a pas de
 * cotitulaire.
 */
function titulaire(colonne: string, type: string): string {
  const brut = `regexp_replace(${colonne}::varchar, '\\s', '', 'g')`;
  return `case
    when ${colonne} is null or trim(${colonne}::varchar) in ('', 'CDL') or ${type} = 'CDL' then null
    when ${brut} ~ '^0+$' then null
    when ${type} = 'SIRET' and ${brut} ~ '^\\d{12,14}$' then lpad(${brut}, 14, '0')
    else trim(${colonne}::varchar)
  end`;
}

/** Littéral SQL échappé pour DuckDB. */
function texte(valeur: string): string {
  return `'${valeur.replaceAll("'", "''")}'`;
}

/**
 * Fusionne et nettoie les deux formats dans la table `marches_norm` et `titulaires_norm`.
 * `sources` donne pour chaque format une relation DuckDB : `read_parquet('…')` en production,
 * un nom de table dans les tests.
 */
export async function normaliser(
  con: DuckDBConnection,
  sources: Record<FormatDecp, string>,
): Promise<void> {
  const brut = (format: FormatDecp) => `
    select
      ${texte(format)} as format,
      trim(id::varchar) as id_marche,
      regexp_replace(acheteur_id::varchar, '\\D', '', 'g') as acheteur_siret,
      ${format === "2019" ? "nullif(trim(acheteur_nom), '')" : "null::varchar"} as acheteur_nom,
      nullif(trim(objet), '') as objet,
      nullif(trim(codecpv), '') as cpv,
      nature, procedure,
      try_cast(montant as double) as montant,
      try_cast(datenotification as date) as date_notification,
      try_cast(dureemois as integer) as duree_mois,
      try_cast(try_cast(offresrecues as double) as integer) as offres_recues,
      ${DEPARTEMENT} as departement,
      source,
      ${titulaire("titulaire_id_1", "titulaire_typeidentifiant_1")} as t1, titulaire_typeidentifiant_1 as tt1,
      ${titulaire("titulaire_id_2", "titulaire_typeidentifiant_2")} as t2, titulaire_typeidentifiant_2 as tt2,
      ${titulaire("titulaire_id_3", "titulaire_typeidentifiant_3")} as t3, titulaire_typeidentifiant_3 as tt3
    from ${sources[format]}`;

  await con.run(`
    create or replace table decp_brut as
    select * from (${brut("2019")} union all ${brut("2022")})
    where id_marche is not null and id_marche <> ''
      and length(acheteur_siret) = 14
      and acheteur_siret !~ '^0+$'
      and date_notification is not null`);

  // Un même marché peut apparaître plusieurs fois (modifications, doublons entre sources ou entre
  // formats) : on garde la ligne de notification la plus ancienne, en préférant le nouveau format.
  // Les marchés transmis par la DGFIP figurent dans les deux formats sous deux identifiants différents
  // (« 20220118 » et « 2022011800 ») : on les reconnaît au même acheteur, même date, même montant,
  // même objet, même CPV et mêmes titulaires (dont l'ordre peut changer d'un format à l'autre : on
  // compare le plus petit identifiant).
  await con.run(`
    create or replace table marches_norm as
    with par_identifiant as (
      select *, row_number() over (
        partition by acheteur_siret, id_marche
        order by date_notification, format desc
      ) as rang
      from decp_brut
    ),
    par_contenu as (
      select * exclude (rang), least(t1, t2, t3) as titulaire_cle, row_number() over (
        partition by acheteur_siret, date_notification, montant, coalesce(objet, ''), coalesce(cpv, ''), least(t1, t2, t3)
        order by format desc, id_marche
      ) as rang
      from par_identifiant
      where rang = 1
    ),
    classe as (
      select *,
        left(cpv, 2) as division,
        case when duree_mois between 1 and 120 then duree_mois end as duree_valide
      from par_contenu
      where rang = 1 or montant is null or titulaire_cle is null
    )
    select
      acheteur_siret || '-' || id_marche as uid,
      id_marche, acheteur_siret, acheteur_nom, objet, cpv,
      case
        when division = '45' then 'travaux'
        when division between '03' and '44' then 'fournitures'
        else 'services'
      end as famille,
      coalesce(division is not null and division not in ('45', '71'), false) as renouvelable,
      nature, procedure,
      -- 9 999 999 €, 99 999 999 €… : valeurs de remplissage des accords-cadres sans maximum
      case when montant > 0 and cast(cast(montant as bigint) as varchar) !~ '^9{7,}$' then montant end as montant,
      date_notification,
      duree_valide as duree_mois,
      cast(date_notification + to_months(duree_valide) as date) as date_fin_estimee,
      case when offres_recues > 0 then offres_recues end as offres_recues,
      departement, source, format,
      t1, tt1, t2, tt2, t3, tt3
    from classe`);

  await con.run(`
    create or replace table titulaires_norm as
    with titulaires as (
      select uid, t1 as titulaire_id, tt1 as type_identifiant from marches_norm
      union all select uid, t2, tt2 from marches_norm
      union all select uid, t3, tt3 from marches_norm
    )
    select distinct on (uid, titulaire_id) uid as marche_uid, titulaire_id, type_identifiant
    from titulaires
    where titulaire_id is not null`);
}

/** Écrit les trois fichiers CSV que `chargerDecp` sait lire. */
export async function exporterCsv(con: DuckDBConnection, dossier: string): Promise<FichiersDecp> {
  const fichiers = {
    marches: `${dossier}/marches.csv`,
    titulaires: `${dossier}/titulaires.csv`,
    acheteurs: `${dossier}/acheteurs.csv`,
  };
  await con.run(`
    copy (
      select uid, id_marche, acheteur_siret, objet, cpv, famille, renouvelable, nature, procedure,
        montant, date_notification, duree_mois, date_fin_estimee, offres_recues, departement,
        source, format
      from marches_norm
    ) to ${texte(fichiers.marches)} (header, delimiter ',')`);
  await con.run(`copy titulaires_norm to ${texte(fichiers.titulaires)} (header, delimiter ',')`);
  await con.run(`
    copy (
      select acheteur_siret as siret, max(acheteur_nom) as nom
      from decp_brut where acheteur_siret in (select acheteur_siret from marches_norm) group by 1
    ) to ${texte(fichiers.acheteurs)} (header, delimiter ',')`);
  return fichiers;
}

export type FichiersDecp = { marches: string; titulaires: string; acheteurs: string };
