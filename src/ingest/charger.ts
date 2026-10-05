import { createReadStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type postgres from "postgres";
import type { FichiersDecp } from "./decp";

/** Applique dans l'ordre les fichiers SQL du dossier qui ne l'ont pas encore été. */
export async function migrer(sql: postgres.Sql, dossier: string): Promise<string[]> {
  await sql`create table if not exists schema_migrations (
    nom text primary key, applique_le timestamptz not null default now()
  )`;
  const dejaFaites = new Set(
    (await sql<{ nom: string }[]>`select nom from schema_migrations`).map((r) => r.nom),
  );
  const fichiers = (await readdir(dossier)).filter((f) => f.endsWith(".sql")).sort();
  const appliquees: string[] = [];
  for (const nom of fichiers) {
    if (dejaFaites.has(nom)) continue;
    const contenu = await readFile(path.join(dossier, nom), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contenu);
      await tx`insert into schema_migrations (nom) values (${nom})`;
    });
    appliquees.push(nom);
  }
  return appliquees;
}

async function copier(tx: postgres.TransactionSql, table: string, colonnes: string, fichier: string) {
  const flux = await tx
    .unsafe(`copy ${table} (${colonnes}) from stdin with (format csv, header true)`)
    .writable();
  await pipeline(createReadStream(fichier), flux);
}

/**
 * Remplace tous les marchés par ceux des fichiers, en une seule transaction :
 * le site continue d'afficher les anciennes données jusqu'à la fin du chargement.
 */
export async function chargerDecp(sql: postgres.Sql, fichiers: FichiersDecp): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`truncate marches_titulaires, marches`;
    await copier(
      tx,
      "marches",
      "uid, id_marche, acheteur_siret, objet, cpv, famille, renouvelable, nature, procedure, montant, " +
        "date_notification, duree_mois, date_fin_estimee, offres_recues, departement, source, format",
      fichiers.marches,
    );
    await copier(tx, "marches_titulaires", "marche_uid, titulaire_id, type_identifiant", fichiers.titulaires);

    await tx`create temporary table acheteurs_import (siret text, nom text) on commit drop`;
    await copier(tx, "acheteurs_import", "siret, nom", fichiers.acheteurs);
    await tx`
      insert into acheteurs (siret, nom)
      select siret, nom from acheteurs_import
      on conflict (siret) do update set nom = coalesce(excluded.nom, acheteurs.nom), maj_le = now()`;

    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from marches`;
    return n;
  });
}

/** Trace chaque import dans la table `imports`, avec son résultat ou son erreur. */
export async function journaliser(
  sql: postgres.Sql,
  source: string,
  travail: () => Promise<number>,
): Promise<number> {
  const [{ id }] = await sql<{ id: number }[]>`insert into imports (source) values (${source}) returning id`;
  try {
    const lignes = await travail();
    await sql`update imports set fin = now(), statut = 'ok', lignes = ${lignes} where id = ${id}`;
    return lignes;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    await sql`update imports set fin = now(), statut = 'erreur', message = ${message} where id = ${id}`;
    throw erreur;
  }
}
