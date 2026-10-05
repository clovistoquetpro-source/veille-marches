/**
 * Noms et caractéristiques des entreprises et des acheteurs, tirés du fichier des unités légales de
 * la base Sirene (Insee, publié chaque mois sur data.gouv.fr en parquet, environ 700 Mo).
 * On ne garde que les SIREN présents dans la base : titulaires de marchés et d'avis, acheteurs.
 */
import type { DuckDBConnection } from "@duckdb/node-api";
import type postgres from "postgres";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { fetchAvecReprises } from "./telechargement";

const JEU_SIRENE = "https://www.data.gouv.fr/api/1/datasets/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/";

/** Adresse du dernier fichier parquet des unités légales. */
export async function urlUnitesLegales(): Promise<string> {
  const reponse = await fetchAvecReprises(JEU_SIRENE);
  if (!reponse.ok) throw new Error(`data.gouv.fr : erreur ${reponse.status}`);
  const jeu = (await reponse.json()) as { resources: { title: string; format: string; url: string }[] };
  const fichier = jeu.resources.find(
    (r) => r.format === "parquet" && /StockUniteLegale/i.test(r.title) && !/Historique/i.test(r.title),
  );
  if (!fichier) throw new Error("Fichier StockUniteLegale introuvable sur data.gouv.fr");
  return fichier.url;
}

/** SIREN à enrichir : acheteurs, titulaires des marchés et des avis. */
export async function sirensUtiles(sql: postgres.Sql): Promise<string[]> {
  const lignes = await sql<{ siren: string }[]>`
    select left(siret, 9) as siren from acheteurs
    union select siren from marches_titulaires where siren is not null
    union select siren from avis_titulaires where siren is not null
    union select left(acheteur_siret, 9) from avis where acheteur_siret is not null`;
  return lignes.map((l) => l.siren);
}

/**
 * Écrit en CSV les unités légales demandées. `unitesLegales` est une relation DuckDB
 * (`read_parquet('…')` en production, une table dans les tests) et `sirens` une table à une colonne.
 * Le nom des entrepreneurs individuels qui refusent la diffusion n'est pas repris.
 */
export async function extraireEntreprises(
  con: DuckDBConnection,
  unitesLegales: string,
  sirens: string,
  sortie: string,
): Promise<void> {
  await con.run(`
    copy (
      select
        u.siren,
        case when u.statutDiffusionUniteLegale = 'O' then coalesce(
          nullif(trim(u.denominationUniteLegale), ''),
          nullif(trim(u.denominationUsuelle1UniteLegale), ''),
          nullif(trim(concat_ws(' ',
            coalesce(u.prenomUsuelUniteLegale, u.prenom1UniteLegale),
            coalesce(u.nomUsageUniteLegale, u.nomUniteLegale))), '')
        ) end as nom,
        case when u.statutDiffusionUniteLegale = 'O' then nullif(trim(u.sigleUniteLegale), '') end as sigle,
        cast(u.categorieJuridiqueUniteLegale as varchar) as categorie_juridique,
        case when u.nomenclatureActivitePrincipaleUniteLegale = 'NAFRev2' then u.activitePrincipaleUniteLegale end as naf,
        nullif(u.trancheEffectifsUniteLegale, 'NN') as tranche_effectif,
        u.categorieEntreprise as categorie,
        u.dateCreationUniteLegale as date_creation,
        coalesce(u.etatAdministratifUniteLegale = 'A', false) as active,
        coalesce(u.statutDiffusionUniteLegale = 'O', false) as diffusible
      from ${unitesLegales} u
      where u.siren in (select siren from ${sirens})
    ) to '${sortie.replaceAll("'", "''")}' (header, delimiter ',')`);
}

/** Met à jour la table `entreprises` à partir du CSV. Renvoie le nombre d'entreprises chargées. */
export async function chargerEntreprises(sql: postgres.Sql, fichier: string): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`create temporary table entreprises_import (like entreprises including defaults) on commit drop`;
    const flux = await tx
      .unsafe(`copy entreprises_import (siren, nom, sigle, categorie_juridique, naf, tranche_effectif,
        categorie, date_creation, active, diffusible) from stdin with (format csv, header true)`)
      .writable();
    await pipeline(createReadStream(fichier), flux);
    const resultat = await tx`
      insert into entreprises (siren, nom, sigle, categorie_juridique, naf, tranche_effectif, categorie,
        date_creation, active, diffusible)
      select siren, nom, sigle, categorie_juridique, naf, tranche_effectif, categorie, date_creation, active,
        diffusible
      from entreprises_import
      on conflict (siren) do update set
        nom = excluded.nom, sigle = excluded.sigle, categorie_juridique = excluded.categorie_juridique,
        naf = excluded.naf, tranche_effectif = excluded.tranche_effectif, categorie = excluded.categorie,
        date_creation = excluded.date_creation, active = excluded.active, diffusible = excluded.diffusible,
        maj_le = now()`;
    return resultat.count;
  });
}
