/**
 * Envoi des courriels par Brevo (API v3). L'envoyeur est une fonction : en développement et dans les
 * tests, on en passe une autre qui écrit dans la console ou garde les messages en mémoire.
 */
import { fetchAvecReprises } from "../ingest/telechargement";

export type Courriel = {
  a: string;
  sujet: string;
  texte: string;
  html: string;
};

export type Envoyeur = (courriel: Courriel) => Promise<void>;

const BREVO = "https://api.brevo.com/v3/smtp/email";

/** Expéditeur par défaut, remplaçable par les variables d'environnement. */
function expediteur() {
  return {
    name: process.env.COURRIEL_NOM ?? "Radar des marchés publics",
    email: process.env.COURRIEL_ADRESSE ?? "alertes@exemple.fr",
  };
}

/** Envoyeur Brevo, ou null si la clé n'est pas configurée. */
export function envoyeurBrevo(cle = process.env.BREVO_API_KEY): Envoyeur | null {
  if (!cle) return null;
  return async (courriel) => {
    const reponse = await fetchAvecReprises(BREVO, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "api-key": cle },
      body: JSON.stringify({
        sender: expediteur(),
        to: [{ email: courriel.a }],
        subject: courriel.sujet,
        textContent: courriel.texte,
        htmlContent: courriel.html,
      }),
    });
    if (!reponse.ok) throw new Error(`Brevo : erreur ${reponse.status} ${await reponse.text()}`);
  };
}

/** Envoyeur de secours : écrit le courriel dans la console au lieu de l'envoyer. */
export const envoyeurConsole: Envoyeur = async (courriel) => {
  console.log(`\n--- à ${courriel.a} : ${courriel.sujet}\n${courriel.texte}`);
};
