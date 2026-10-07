/**
 * Envoie les alertes par courriel aux clients qui ont du nouveau.
 * Usage : DATABASE_URL=… BREVO_API_KEY=… npm run alertes [-- --frequence hebdomadaire] [-- --essai] [-- --une-fois-par-jour]
 * Sans clé Brevo, ou avec --essai, les courriels sont écrits dans la console au lieu d'être envoyés.
 * Avec --une-fois-par-jour, rien n'est fait si cet envoi a déjà réussi aujourd'hui (heure de Paris) :
 * l'envoi de 7 h est programmé deux fois pour suivre le changement d'heure et les retards de GitHub.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { envoyerAlertes, FREQUENCES, type Frequence } from "../src/lib/alertes";
import { envoyeurBrevo, envoyeurConsole } from "../src/lib/courriel";
import { journaliser, migrer } from "../src/ingest/charger";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const { values } = parseArgs({
    options: { frequence: { type: "string" }, essai: { type: "boolean" }, "une-fois-par-jour": { type: "boolean" } },
  });
  const frequence = (values.frequence ?? "quotidienne") as Frequence;
  if (!FREQUENCES.includes(frequence)) {
    throw new Error(`--frequence attend ${FREQUENCES.map((f) => `« ${f} »`).join(", ")}`);
  }
  const envoyeur = (values.essai ? null : envoyeurBrevo()) ?? envoyeurConsole;
  if (envoyeur === envoyeurConsole && !values.essai) {
    console.log("BREVO_API_KEY absente : les courriels sont affichés, pas envoyés.");
  }

  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await migrer(sql, path.join(process.cwd(), "db/migrations"));
    if (values["une-fois-par-jour"]) {
      const [{ fait }] = await sql<{ fait: boolean }[]>`
        select exists (
          select 1 from imports where source = ${`alertes-${frequence}`} and statut = 'ok'
            and (debut at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date
        ) as fait`;
      if (fait) {
        console.log(`Alertes ${frequence} déjà envoyées aujourd'hui.`);
        return;
      }
    }
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
