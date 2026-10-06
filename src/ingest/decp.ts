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
      -- certains objets portent des « \\n » littéraux et des espaces en série
      nullif(trim(regexp_replace(replace(objet, '\\n', ' '), '\\s+', ' ', 'g')), '') as objet,
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
  // À égalité, l'empreinte de la ligne entière tranche : deux imports des mêmes données gardent les
  // mêmes lignes, sinon l'import réécrirait chaque semaine des milliers de marchés inchangés.
  // Les marchés transmis par la DGFIP figurent dans les deux formats sous deux identifiants différents
  // (« 20220118 » et « 2022011800 ») : on les reconnaît au même acheteur, même date, même montant,
  // même objet, même CPV et mêmes titulaires (dont l'ordre peut changer d'un format à l'autre : on
  // compare le plus petit identifiant).
  await con.run(`
    create or replace table marches_norm as
    with par_identifiant as (
      select *, row_number() over (
        partition by acheteur_siret, id_marche
        order by date_notification, format desc, hash(decp_brut)
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
    -- Un identifiant allongé de zéros (« 2026f57m401 » et « 2026f57m40100000 ») désigne le même
    -- marché, même quand l'objet a été retouché d'un envoi à l'autre.
    par_identifiant_proche as (
      select * exclude (rang), row_number() over (
        partition by acheteur_siret, date_notification, montant, titulaire_cle, rtrim(id_marche, '0')
        order by format desc, id_marche
      ) as rang
      from par_contenu
      where rang = 1 or montant is null or titulaire_cle is null
    ),
    -- Le même marché transmis par deux sources (la DGFIP et la plateforme de l'acheteur) a deux
    -- identifiants, deux objets rédigés différemment et parfois deux codes CPV, mais le même acheteur,
    -- la même date, le même montant et les mêmes titulaires. On garde une seule source, de préférence
    -- la plateforme, dont l'objet est plus lisible ; les lots d'une même source restent distincts.
    par_source as (
      select *, first_value(source) over (
        partition by acheteur_siret, date_notification, montant, titulaire_cle
        order by coalesce(source, '') like 'DGFIP%', source
      ) as source_retenue
      from par_identifiant_proche
      where rang = 1 or montant is null or titulaire_cle is null
    ),
    classe as (
      select *,
        left(cpv, 2) as division,
        case when duree_mois between 1 and 120 then duree_mois end as duree_valide
      from par_source
      where source is not distinct from source_retenue or montant is null or titulaire_cle is null
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
    where titulaire_id is not null
    order by uid, titulaire_id, type_identifiant`);
}

/**
 * Années de marchés gardées en base, en plus des marchés encore en cours : de quoi voir ce que chaque
 * acheteur achète et repérer les relances, tout en tenant dans les 500 Mo de l'offre gratuite de Supabase.
 */
export const ANNEES_HISTORIQUE = 3;

/** Date (AAAA-MM-JJ) d'il y a `annees` ans. */
export function ilYaAns(annees: number, aujourdhui = new Date()): string {
  const date = new Date(aujourdhui);
  date.setUTCFullYear(date.getUTCFullYear() - annees);
  return date.toISOString().slice(0, 10);
}

export type FichiersDecp = {
  /** marchés nouveaux ou modifiés, avec leur nouvel `id` */
  marches: string;
  titulaires: string;
  acheteurs: string;
  /** `id` des marchés en base à supprimer : disparus des DECP, sortis de l'historique ou modifiés */
  supprimes: string;
  nbAjoutes: number;
  nbSupprimes: number;
};

/**
 * Compare les marchés nettoyés à ceux déjà en base et écrit les fichiers CSV que `chargerDecp` sait
 * lire : on ne réécrit que ce qui a changé, pour que l'import ne double jamais la taille de la base.
 * `enBase` est un CSV (uid, id, empreinte) des marchés en base, absent au premier import. On garde les
 * marchés notifiés depuis `depuis` (AAAA-MM-JJ) ou qui ne sont pas encore finis.
 */
export async function exporterCsv(
  con: DuckDBConnection,
  dossier: string,
  { enBase, depuis = ilYaAns(ANNEES_HISTORIQUE) }: { enBase?: string; depuis?: string } = {},
): Promise<FichiersDecp> {
  const fichiers = {
    marches: `${dossier}/marches.csv`,
    titulaires: `${dossier}/titulaires.csv`,
    acheteurs: `${dossier}/acheteurs.csv`,
    supprimes: `${dossier}/supprimes.csv`,
  };
  await con.run(enBase
    ? `create or replace table en_base as select * from read_csv(${texte(enBase)}, header = true,
        columns = {'uid': 'VARCHAR', 'id': 'INTEGER', 'empreinte': 'VARCHAR'})`
    : "create or replace table en_base (uid varchar, id integer, empreinte varchar)");
  await con.run(`
    create or replace table retenus as
    with liste as (
      select marche_uid, string_agg(titulaire_id || ' ' || coalesce(type_identifiant, ''), ',' order by titulaire_id) as titulaires
      from titulaires_norm group by 1
    )
    select m.*, md5(cast(row(
      m.uid, m.objet, m.cpv, m.famille, m.renouvelable, m.montant, m.date_notification, m.duree_mois,
      m.date_fin_estimee, m.offres_recues, m.departement, l.titulaires
    ) as varchar)) as empreinte
    from marches_norm m left join liste l on l.marche_uid = m.uid
    where m.date_notification >= date ${texte(depuis)} or m.date_fin_estimee >= current_date`);
  await con.run(`
    create or replace table supprimes as
    select b.id from en_base b anti join retenus r on r.uid = b.uid and r.empreinte = b.empreinte`);
  // Les nouveaux identifiants suivent le plus grand déjà attribué : jamais deux fois le même. Les
  // fichiers sont triés par identifiant : les index se remplissent dans l'ordre et restent compacts.
  await con.run(`
    create or replace table ajoutes as
    select r.*, (select coalesce(max(id), 0) from en_base) + row_number() over (order by r.uid) as id
    from retenus r anti join en_base b on b.uid = r.uid and b.empreinte = r.empreinte`);
  await con.run(`copy (select id from supprimes order by id) to ${texte(fichiers.supprimes)} (header, delimiter ',')`);
  await con.run(`
    copy (
      select id, uid, acheteur_siret, objet, cpv, famille, renouvelable, montant, date_notification,
        duree_mois, date_fin_estimee, offres_recues, departement, empreinte
      from ajoutes order by id
    ) to ${texte(fichiers.marches)} (header, delimiter ',')`);
  await con.run(`
    copy (
      select a.id as marche_id, t.titulaire_id, t.type_identifiant
      from titulaires_norm t join ajoutes a on a.uid = t.marche_uid
      order by a.id, t.titulaire_id
    ) to ${texte(fichiers.titulaires)} (header, delimiter ',')`);
  await con.run(`
    copy (
      select acheteur_siret as siret, max(acheteur_nom) as nom
      from decp_brut where acheteur_siret in (select acheteur_siret from ajoutes) group by 1
    ) to ${texte(fichiers.acheteurs)} (header, delimiter ',')`);
  const compte = await con.runAndReadAll(
    "select (select count(*) from ajoutes)::integer as ajoutes, (select count(*) from supprimes)::integer as supprimes",
  );
  const [nbAjoutes, nbSupprimes] = compte.getRows()[0] as [number, number];
  return { ...fichiers, nbAjoutes, nbSupprimes };
}
