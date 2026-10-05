"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adresseSite } from "@/lib/alertes";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { db } from "@/lib/db";
import { creerPagePaiement } from "@/lib/stripe";

export type EtatPaiement = { erreur?: string };

/** Ouvre la page de paiement Stripe et y envoie le client. */
export async function actionPaiement(_etat: EtatPaiement, _formulaire: FormData): Promise<EtatPaiement> {
  const sql = db();
  if (!sql) return { erreur: "Base de données non configurée (variable DATABASE_URL)." };
  let adresse: string | null;
  try {
    const compte = await compteDeLaSession(sql, (await cookies()).get(COOKIE_SESSION)?.value);
    if (!compte) return { erreur: "Votre session a expiré." };
    const site = adresseSite();
    adresse = await creerPagePaiement({
      compteId: compte.id,
      email: compte.email,
      succes: `${site}/abonnement?paye=oui`,
      annule: `${site}/abonnement`,
    });
  } catch (erreur) {
    console.error(erreur);
    return { erreur: "Le paiement n'a pas pu être ouvert. Réessayez dans un instant." };
  } finally {
    await sql.end();
  }
  if (!adresse) return { erreur: "Le paiement n'est pas configuré sur cette installation." };
  redirect(adresse);
}
