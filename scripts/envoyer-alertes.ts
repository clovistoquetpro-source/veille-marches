/**
 * Envoie les alertes par courriel aux clients qui ont du nouveau.
 * Usage : DATABASE_URL=… BREVO_API_KEY=… npm run alertes [-- --frequence hebdomadaire] [-- --essai]
 * Sans clé Brevo, ou avec --essai, les courriels sont écrits dans la console au lieu d'être envoyés.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { envoyerAlertes, type Frequence } from "../src/lib/alertes";
import { envoyeurBrevo, envoyeurConsole } from "../src/lib/courriel";
import { journaliser, migrer } from "../src/ingest/charger";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const { values } = parseArgs({ options: { frequence: { type: "string" }, essai: { type: "boolean" } } });
  const frequence = (values.frequence ?? "quotidienne") as Frequence;
  if (frequence !== "quotidienne" && frequence !== "hebdomadaire") {
    throw new Error("--frequence attend « quotidienne » ou « hebdomadaire »");
  }
  const envoyeur = (values.essai ? null : envoyeurBrevo()) ?? envoyeurConsole;
  if (envoyeur === envoyeurConsole && !values.essai) {
    console.log("BREVO_API_KEY absente : les courriels sont affichés, pas envoyés.");
  }

  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await migrer(sql, path.join(process.cwd(), "db/migrations"));
    const resultat = await journaliser(sql, `alertes-${frequence}`, async () => {
      const r = await envoyerAlertes(sql, envoyeur, frequence);
      console.log(`${r.envoyees} alertes envoyées, ${r.sansNouveaute} sans nouveauté, ${r.erreurs} en erreur.`);
      return r.envoyees;
    });
    if (resultat === 0) console.log("Rien à envoyer.");
  } finally {
    await sql.end();
  }
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
