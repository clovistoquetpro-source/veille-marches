/**
 * Met à jour les noms et caractéristiques des entreprises et acheteurs à partir de la base Sirene.
 * Usage : DATABASE_URL=… npm run import:sirene
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { journaliser, migrer } from "../src/ingest/charger";
import { chargerEntreprises, extraireEntreprises, sirensUtiles, urlUnitesLegales } from "../src/ingest/sirene";
import { telecharger } from "../src/ingest/telechargement";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await migrer(sql, path.join(process.cwd(), "db/migrations"));
    const lignes = await journaliser(sql, "sirene", async () => {
      const dossier = await mkdtemp(path.join(tmpdir(), "sirene-"));
      const stock = path.join(dossier, "unites-legales.parquet");
      console.log("Téléchargement des unités légales…");
      await telecharger(await urlUnitesLegales(), stock);

      const sirens = await sirensUtiles(sql);
      console.log(`${sirens.length} SIREN à enrichir…`);
      const listeSirens = path.join(dossier, "sirens.csv");
      await writeFile(listeSirens, `siren\n${sirens.join("\n")}\n`);

      const duck = await (await DuckDBInstance.create(":memory:")).connect();
      await duck.run(`create table sirens as select * from read_csv('${listeSirens}', header = true, columns = {'siren': 'VARCHAR'})`);
      const sortie = path.join(dossier, "entreprises.csv");
      await extraireEntreprises(duck, `read_parquet('${stock}')`, "sirens", sortie);
      return chargerEntreprises(sql, sortie);
    });
    console.log(`${lignes} entreprises mises à jour.`);
  } finally {
    await sql.end();
  }
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
