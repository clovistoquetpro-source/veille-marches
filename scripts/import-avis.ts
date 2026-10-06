/**
 * Importe les avis publiés depuis le dernier import (ou depuis la date donnée) : avis nationaux du
 * BOAMP et avis européens de TED. Supprime ensuite les avis de plus de six mois dont la date limite est passée.
 * Usage : DATABASE_URL=… npm run import:avis [-- --depuis 2026-09-01] [-- --jusqua 2026-09-30]
 */
import path from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { enregistrerAvis, MOIS_AVIS, purgerAvis } from "../src/ingest/avis";
import { lireAvisBoamp, telechargerBoamp } from "../src/ingest/boamp";
import { journaliser, migrer } from "../src/ingest/charger";
import { lireAvisTed, telechargerTed } from "../src/ingest/ted";

const jour = (date: Date) => date.toISOString().slice(0, 10);

function joursAvant(date: string, jours: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - jours);
  return jour(d);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const { values } = parseArgs({ options: { depuis: { type: "string" }, jusqua: { type: "string" } } });
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await migrer(sql, path.join(process.cwd(), "db/migrations"));
    const jusqua = values.jusqua ?? jour(new Date());

    for (const source of ["boamp", "ted"] as const) {
      // Les sources publient parfois avec un ou deux jours de retard : on reprend 3 jours en arrière.
      const [{ dernier }] = await sql<{ dernier: string | null }[]>`
        select max(date_publication)::text as dernier from avis where source = ${source}`;
      const depuis = values.depuis ?? (dernier ? joursAvant(dernier, 3) : joursAvant(jusqua, 30));
      console.log(`${source.toUpperCase()} : avis du ${depuis} au ${jusqua}…`);
      const lignes = await journaliser(sql, source, async () => {
        const avis = source === "boamp"
          ? (await telechargerBoamp(depuis, jusqua)).map(lireAvisBoamp).filter((a) => a !== null)
          : (await telechargerTed(depuis, jusqua)).map(lireAvisTed);
        return enregistrerAvis(sql, avis);
      });
      console.log(`${lignes} avis ${source.toUpperCase()} enregistrés.`);
    }
    const purges = await purgerAvis(sql);
    await sql`vacuum analyze avis, avis_titulaires`;
    console.log(`${purges} avis de plus de ${MOIS_AVIS} mois supprimés.`);
  } finally {
    await sql.end();
  }
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
