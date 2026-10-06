/**
 * Télécharge les DECP, les nettoie et remplace les marchés en base.
 * Usage : DATABASE_URL=… npm run import:decp
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { chargerDecp, journaliser, migrer } from "../src/ingest/charger";
import { exporterCsv, type FormatDecp, normaliser, urlExport } from "../src/ingest/decp";
import { telecharger } from "../src/ingest/telechargement";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await migrer(sql, path.join(process.cwd(), "db/migrations"));
    const lignes = await journaliser(sql, "decp", async () => {
      const dossier = await mkdtemp(path.join(tmpdir(), "decp-"));
      const sources = {} as Record<FormatDecp, string>;
      for (const format of ["2019", "2022"] as const) {
        const fichier = path.join(dossier, `decp-${format}.parquet`);
        console.log(`Téléchargement du format ${format}…`);
        await telecharger(urlExport(format), fichier);
        sources[format] = `read_parquet('${fichier}')`;
      }
      console.log("Nettoyage…");
      const duck = await (await DuckDBInstance.create(":memory:")).connect();
      await normaliser(duck, sources);
      const fichiers = await exporterCsv(duck, dossier);
      console.log("Chargement en base…");
      return chargerDecp(sql, fichiers);
    });
    console.log(`${lignes} marchés importés.`);
  } finally {
    await sql.end();
  }
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
