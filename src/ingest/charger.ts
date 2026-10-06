import { createReadStream, createWriteStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { finished, pipeline } from "node:stream/promises";
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

/** Champ CSV, entre guillemets s'il contient une virgule, un guillemet ou un saut de ligne. */
function champCsv(valeur: string): string {
  return /[",\r\n]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur;
}

/**
 * Écrit dans `fichier` le CSV (uid, id, empreinte) des marchés en base, que `exporterCsv` compare aux
 * DECP. On lit par pages plutôt qu'avec `copy … to stdout` : le flux de postgres.js 3.4 peut laisser la
 * connexion en pause à la fin de la copie, et la requête suivante attend alors indéfiniment.
 */
export async function exporterEnBase(sql: postgres.Sql, fichier: string, page = 50000): Promise<void> {
  const sortie = createWriteStream(fichier);
  sortie.write("uid,id,empreinte\n");
  let dernier = 0;
  for (;;) {
    const lignes = await sql<{ uid: string; id: number; empreinte: string }[]>`
      select uid, id, replace(empreinte::text, '-', '') as empreinte
      from marches where id > ${dernier} order by id limit ${page}`;
    if (lignes.length === 0) break;
    sortie.write(lignes.map((l) => `${champCsv(l.uid)},${l.id},${l.empreinte}\n`).join(""));
    dernier = lignes[lignes.length - 1].id;
  }
  sortie.end();
  await finished(sortie);
}

async function supprimerMarches(tx: postgres.TransactionSql, fichiers: FichiersDecp) {
  await tx`create temporary table marches_supprimes (id integer) on commit drop`;
  await copier(tx, "marches_supprimes", "id", fichiers.supprimes);
  // les titulaires suivent (on delete cascade)
  await tx`delete from marches where id in (select id from marches_supprimes)`;
}

/**
 * Applique en base les changements préparés par `exporterCsv` : supprime les marchés disparus ou
 * modifiés, ajoute les nouveaux. Renvoie le nombre de marchés en base.
 *
 * D'habitude tout se fait en une transaction : le site affiche les anciennes données jusqu'à la fin.
 * Quand plus d'un marché sur cinq change (nouvelle règle de nettoyage), on supprime d'abord, puis on
 * fait le ménage avant d'ajouter : sinon anciennes et nouvelles lignes coexisteraient le temps de
 * l'import, et la base dépasserait les 500 Mo de l'offre gratuite de Supabase.
 */
export async function chargerDecp(sql: postgres.Sql, fichiers: FichiersDecp): Promise<number> {
  const [{ n: avant }] = await sql<{ n: number }[]>`select count(*)::int as n from marches`;
  const enDeuxTemps = fichiers.nbSupprimes > avant / 5;
  if (enDeuxTemps) {
    await sql.begin((tx) => supprimerMarches(tx, fichiers));
    await sql`vacuum marches, marches_titulaires`;
  }
  const n = await sql.begin(async (tx) => {
    if (!enDeuxTemps) await supprimerMarches(tx, fichiers);
    await copier(
      tx,
      "marches",
      "id, uid, acheteur_siret, objet, cpv, famille, renouvelable, montant, date_notification, duree_mois, " +
        "date_fin_estimee, offres_recues, departement, empreinte",
      fichiers.marches,
    );
    await copier(tx, "marches_titulaires", "marche_id, titulaire_id, type_identifiant", fichiers.titulaires);

    await tx`create temporary table acheteurs_import (siret text, nom text) on commit drop`;
    await copier(tx, "acheteurs_import", "siret, nom", fichiers.acheteurs);
    await tx`
      insert into acheteurs (siret, nom)
      select siret, nom from acheteurs_import
      on conflict (siret) do update set nom = coalesce(excluded.nom, acheteurs.nom), maj_le = now()`;

    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from marches`;
    return n;
  });
  // La place des lignes supprimées resservira au prochain import au lieu d'agrandir les tables.
  await sql`vacuum analyze marches, marches_titulaires`;
  return n;
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
