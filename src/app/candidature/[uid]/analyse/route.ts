import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import { abonnementDuCompte, accesOuvert } from "@/lib/abonnements";
import { analyserDossier, analysesRestantes, enregistrerAnalyse, FICHIERS_MAX, fichiersDuCompte, oublierFichiers } from "@/lib/analyse";
import { avisPourCandidature, candidatDuCompte } from "@/lib/candidature";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { db } from "@/lib/db";
import { profilDuCompte } from "@/lib/profil";

export const dynamic = "force-dynamic";

/**
 * Lance l'analyse des fichiers déposés. L'IA met une à deux minutes à lire un dossier : la réponse
 * est envoyée au fil de l'eau (un espace toutes les dix secondes pour garder la connexion ouverte),
 * et sa dernière ligne dit où lire le résultat, ou ce qui n'a pas marché.
 */
export async function POST(requete: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const session = (await cookies()).get(COOKIE_SESSION)?.value;
  const demande = (await requete.json().catch(() => null)) as { fichiers?: unknown } | null;
  const ids = Array.isArray(demande?.fichiers)
    ? [...new Set(demande.fichiers.filter((id): id is string => typeof id === "string"))].slice(0, FICHIERS_MAX)
    : [];

  const encodeur = new TextEncoder();
  const flux = new ReadableStream<Uint8Array>({
    async start(controleur) {
      const battement = setInterval(() => controleur.enqueue(encodeur.encode(" ")), 10_000);
      const finir = (resultat: { id: string } | { erreur: string }) => {
        clearInterval(battement);
        controleur.enqueue(encodeur.encode(`\n${JSON.stringify(resultat)}\n`));
        controleur.close();
      };
      const cle = process.env.ANTHROPIC_API_KEY;
      const sql = db();
      if (!cle || !sql) return finir({ erreur: "L'analyse des dossiers n'est pas encore activée." });
      try {
        const compte = await compteDeLaSession(sql, session);
        if (!compte) return finir({ erreur: "Reconnectez-vous pour continuer." });
        const [avis, abonnement, restantes, fichiers, profil] = await Promise.all([
          avisPourCandidature(sql, uid), abonnementDuCompte(sql, compte.id), analysesRestantes(sql, compte.id),
          fichiersDuCompte(sql, compte.id, ids), profilDuCompte(sql, compte.id),
        ]);
        if (!avis) return finir({ erreur: "Avis introuvable." });
        if (!accesOuvert(abonnement)) return finir({ erreur: "Votre essai est terminé : reprenez l'abonnement pour analyser un dossier." });
        if (restantes === 0) return finir({ erreur: "Vous avez utilisé toutes vos analyses du mois." });
        if (fichiers.length === 0) return finir({ erreur: "Ajoutez au moins un PDF du dossier." });

        const candidat = await candidatDuCompte(sql, compte);
        const analyse = await analyserDossier({ cle, avis, candidat, profil, fichiers });
        // le dossier ne sert plus, qu'on ait réussi ou non : on ne garde pas les documents du client
        await oublierFichiers(sql, cle, fichiers.map((f) => f.fichier_id));
        if (!analyse) return finir({ erreur: "L'analyse n'a pas abouti. Elle n'est pas décomptée : réessayez, ou envoyez moins de pages." });
        const id = await enregistrerAnalyse(sql, {
          compteId: compte.id, avisUid: avis.uid, fichiers: fichiers.map((f) => f.nom),
          resultat: analyse.donnees, modele: analyse.modele, consommation: analyse.consommation,
        });
        finir({ id });
      } catch (erreur) {
        console.error("Analyse du dossier", erreur);
        finir({ erreur: "Une erreur est survenue. Réessayez dans un instant." });
      } finally {
        await sql.end();
      }
    },
  });
  return new Response(flux, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
