/** Applique les migrations de db/migrations. Usage : DATABASE_URL=… npm run db:migrer */
import path from "node:path";
import postgres from "postgres";
import { migrer } from "../src/ingest/charger";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const appliquees = await migrer(sql, path.join(process.cwd(), "db/migrations"));
    console.log(appliquees.length ? `Appliquées : ${appliquees.join(", ")}` : "Base déjà à jour.");
  } finally {
    await sql.end();
  }
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
