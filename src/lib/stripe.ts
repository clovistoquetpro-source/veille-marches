/**
 * Paiement par Stripe, en appelant l'API directement : la bibliothèque officielle tire Node avec
 * elle, et le site tourne sur Cloudflare Workers. Deux choses seulement : ouvrir une page de
 * paiement, et comprendre les événements que Stripe nous renvoie.
 */
import { JOURS_ESSAI } from "./produit";

const API = "https://api.stripe.com/v1";

/** Vrai quand la clé et le tarif sont configurés : sinon le site reste en accès d'essai. */
export function paiementConfigure(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRIX);
}

/**
 * Ouvre une page de paiement Stripe et renvoie son adresse, ou null si le paiement n'est pas
 * configuré. `compteId` revient dans l'événement : c'est lui qui relie le paiement au compte.
 */
export async function creerPagePaiement(
  options: { compteId: string; email: string; succes: string; annule: string },
  cle = process.env.STRIPE_SECRET_KEY,
  prix = process.env.STRIPE_PRIX,
): Promise<string | null> {
  if (!cle || !prix) return null;
  const corps = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": prix,
    "line_items[0][quantity]": "1",
    success_url: options.succes,
    cancel_url: options.annule,
    customer_email: options.email,
    client_reference_id: options.compteId,
    "subscription_data[trial_period_days]": String(JOURS_ESSAI),
    "subscription_data[metadata][compte_id]": options.compteId,
    locale: "fr",
  });
  const reponse = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${cle}`, "content-type": "application/x-www-form-urlencoded" },
    body: corps,
  });
  if (!reponse.ok) throw new Error(`Stripe : erreur ${reponse.status} ${await reponse.text()}`);
  const session = (await reponse.json()) as { url?: string };
  return session.url ?? null;
}

/** Ce qu'on retient d'un événement Stripe. */
export type EvenementAbonnement = {
  type: string;
  compte_id: string | null;
  client_stripe: string | null;
  abonnement_stripe: string | null;
  statut: "actif" | "en_retard" | "resilie" | null;
  fin_periode: string | null;
};

/** Statut Stripe → notre statut. `trialing` compte comme actif : la carte est déjà enregistrée. */
function statut(etat: string | undefined): EvenementAbonnement["statut"] {
  if (etat === "active" || etat === "trialing") return "actif";
  if (etat === "past_due" || etat === "unpaid" || etat === "incomplete") return "en_retard";
  if (etat === "canceled" || etat === "incomplete_expired") return "resilie";
  return null;
}

function hex(octets: ArrayBuffer): string {
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/** Comparaison à durée constante, pour ne rien laisser deviner de la signature attendue. */
function memeChaine(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

/**
 * Vérifie la signature de Stripe (en-tête `stripe-signature`) et renvoie l'événement, ou null si la
 * signature est absente, fausse ou trop ancienne. Le corps doit être le texte brut reçu.
 */
export async function lireEvenementStripe(
  corps: string,
  signature: string | null,
  secret = process.env.STRIPE_WEBHOOK_SECRET,
  toleranceSecondes = 300,
): Promise<EvenementAbonnement | null> {
  if (!signature || !secret) return null;
  const champs = Object.fromEntries(
    signature.split(",").map((c) => c.split("=", 2) as [string, string]).filter((c) => c.length === 2),
  );
  const horodatage = Number(champs.t);
  if (!champs.v1 || !Number.isFinite(horodatage)) return null;
  if (Math.abs(Date.now() / 1000 - horodatage) > toleranceSecondes) return null;

  const cle = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const attendue = hex(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${horodatage}.${corps}`)));
  if (!memeChaine(attendue, champs.v1)) return null;

  const evenement = JSON.parse(corps) as {
    type: string;
    data: { object: Record<string, unknown> };
  };
  const objet = evenement.data?.object ?? {};
  const abonnement = typeof objet.subscription === "string" ? objet.subscription : null;
  const metadonnees = (objet.metadata ?? {}) as Record<string, string>;
  const finPeriode = typeof objet.current_period_end === "number"
    ? new Date(objet.current_period_end * 1000).toISOString()
    : null;

  return {
    type: evenement.type,
    compte_id: (typeof objet.client_reference_id === "string" ? objet.client_reference_id : null)
      ?? metadonnees.compte_id ?? null,
    client_stripe: typeof objet.customer === "string" ? objet.customer : null,
    abonnement_stripe: abonnement ?? (typeof objet.id === "string" && objet.id.startsWith("sub_") ? objet.id : null),
    statut: evenement.type === "checkout.session.completed"
      ? "actif"
      : statut(typeof objet.status === "string" ? objet.status : undefined),
    fin_periode: finPeriode,
  };
}
