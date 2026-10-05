import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

/**
 * `fetch` qui réessaie quand le serveur est indisponible (erreurs 429 et 5xx, coupure réseau) :
 * data.gouv.fr, le BOAMP et TED répondent parfois 503 quelques secondes. Les autres erreurs
 * (requête invalide, 404) sont renvoyées telles quelles à l'appelant.
 */
export async function fetchAvecReprises(url: string, options: RequestInit = {}, essais = 5): Promise<Response> {
  for (let essai = 1; ; essai++) {
    try {
      const reponse = await fetch(url, options);
      if (essai >= essais || (reponse.status !== 429 && reponse.status < 500)) return reponse;
    } catch (erreur) {
      if (essai >= essais) throw erreur;
    }
    await attendre(essai);
  }
}

function attendre(essai: number) {
  return new Promise((r) => setTimeout(r, Math.min(2000 * essai, 15000)));
}

/**
 * Télécharge un fichier en reprenant là où la connexion s'est coupée : les gros fichiers de
 * static.data.gouv.fr (Sirene, plusieurs centaines de Mo) sont parfois interrompus.
 */
export async function telecharger(url: string, fichier: string, essais = 20): Promise<void> {
  for (let essai = 1; ; essai++) {
    const deja = await stat(fichier).then((s) => s.size, () => 0);
    try {
      const reponse = await fetch(url, deja > 0 ? { headers: { range: `bytes=${deja}-` } } : {});
      if (reponse.status === 416) return; // déjà complet
      if (!reponse.ok || !reponse.body) throw new Error(`erreur ${reponse.status}`);
      const reprise = deja > 0 && reponse.status === 206;
      await pipeline(
        Readable.fromWeb(reponse.body as ReadableStream),
        createWriteStream(fichier, { flags: reprise ? "a" : "w" }),
      );
      return;
    } catch (erreur) {
      if (essai >= essais) {
        throw new Error(`Téléchargement impossible : ${url} (${erreur instanceof Error ? erreur.message : erreur})`);
      }
      await attendre(essai);
    }
  }
}
