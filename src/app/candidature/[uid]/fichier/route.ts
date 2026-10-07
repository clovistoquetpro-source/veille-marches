import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { abonnementDuCompte, accesOuvert } from "@/lib/abonnements";
import {
  analysesRestantes, DEPOTS_MAX_PAR_JOUR, depotsRecents, enregistrerFichier, oublierFichiersAbandonnes, TAILLE_MAX_FICHIER,
} from "@/lib/analyse";
import { deposerFichier, supprimerFichier } from "@/lib/claude";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const erreur = (message: string, status: number) => NextResponse.json({ erreur: message }, { status });

/**
 * Reçoit une pièce du dossier (un PDF, champ « file ») et la transmet telle quelle à l'API Files
 * d'Anthropic, qui la garde le temps de l'analyse.
 */
export async function POST(requete: NextRequest) {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return erreur("L'analyse des dossiers n'est pas encore activée.", 503);
  const type = requete.headers.get("content-type") ?? "";
  const taille = Number(requete.headers.get("content-length") ?? "0");
  if (!type.startsWith("multipart/form-data") || !requete.body) return erreur("Envoi mal formé.", 400);
  // la marge couvre les en-têtes du formulaire autour du fichier
  if (taille > TAILLE_MAX_FICHIER + 64 * 1024) return erreur("Fichier trop lourd (30 Mo au plus).", 413);

  const sql = db();
  if (!sql) return erreur("Base de données non configurée.", 503);
  try {
    const compte = await compteDeLaSession(sql, (await cookies()).get(COOKIE_SESSION)?.value);
    if (!compte) return erreur("Reconnectez-vous pour continuer.", 401);
    const [abonnement, restantes, depots] = await Promise.all([
      abonnementDuCompte(sql, compte.id), analysesRestantes(sql, compte.id), depotsRecents(sql, compte.id),
    ]);
    if (!accesOuvert(abonnement)) return erreur("Votre essai est terminé : reprenez l'abonnement pour analyser un dossier.", 402);
    if (restantes === 0) return erreur("Vous avez utilisé toutes vos analyses du mois.", 429);
    if (depots >= DEPOTS_MAX_PAR_JOUR) return erreur("Trop de fichiers envoyés aujourd'hui, réessayez demain.", 429);

    const fichier = await deposerFichier(cle, requete.body, type);
    if (!fichier) return erreur("Le fichier n'a pas pu être envoyé. Réessayez.", 502);
    if (fichier.type !== "application/pdf") {
      await supprimerFichier(cle, fichier.id);
      return erreur(`« ${fichier.nom} » n'est pas un PDF.`, 415);
    }
    await enregistrerFichier(sql, compte.id, fichier);
    await oublierFichiersAbandonnes(sql, cle);
    return NextResponse.json({ id: fichier.id, nom: fichier.nom });
  } finally {
    await sql.end();
  }
}
