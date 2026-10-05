/**
 * Réception des événements Stripe (paiement accepté, abonnement renouvelé, résilié…).
 * L'adresse de ce point d'entrée est à déclarer dans Stripe : https://…/api/stripe
 */
import { compteDeLAbonnementStripe, majAbonnement } from "@/lib/abonnements";
import { db } from "@/lib/db";
import { lireEvenementStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const SUIVIS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

export async function POST(requete: Request): Promise<Response> {
  const evenement = await lireEvenementStripe(await requete.text(), requete.headers.get("stripe-signature"));
  // signature absente ou fausse : on refuse sans rien dire de plus
  if (!evenement) return new Response("signature refusée", { status: 400 });
  if (!SUIVIS.has(evenement.type) || !evenement.statut) return new Response("ignoré", { status: 200 });

  const sql = db();
  if (!sql) return new Response("base non configurée", { status: 500 });
  try {
    const compteId = evenement.compte_id
      ?? (evenement.abonnement_stripe && await compteDeLAbonnementStripe(sql, evenement.abonnement_stripe));
    // un abonnement qu'on ne rattache à aucun compte n'est pas une erreur de Stripe : on l'acquitte
    if (!compteId) return new Response("compte inconnu", { status: 200 });
    await majAbonnement(sql, compteId, {
      statut: evenement.statut,
      client_stripe: evenement.client_stripe,
      abonnement_stripe: evenement.abonnement_stripe,
      fin_periode: evenement.fin_periode,
    });
  } finally {
    await sql.end();
  }
  return new Response("ok", { status: 200 });
}
