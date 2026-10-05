/**
 * Ce qui change quand le produit prend son nom définitif, sa société et son prix : tout est ici.
 * Les mentions légales et les conditions d'utilisation lisent ces mêmes valeurs.
 */

/** Nom commercial. Nom de travail tant que le nom définitif n'est pas arrêté. */
export const NOM = "Radar des marchés publics";

export const BASELINE = "Les marchés publics de l'an prochain, dès aujourd'hui.";

/** Abonnement mensuel, en euros hors taxes. */
export const PRIX_MENSUEL = 29;

/** Jours d'essai gratuit avant le premier prélèvement. */
export const JOURS_ESSAI = 14;

/**
 * Éditeur du site. À compléter par l'exploitant avant la mise en ligne : la loi pour la confiance
 * dans l'économie numérique impose ces mentions, et les conditions de vente les reprennent.
 */
export const EDITEUR = {
  raison_sociale: process.env.EDITEUR_RAISON_SOCIALE ?? "[raison sociale à compléter]",
  forme: process.env.EDITEUR_FORME ?? "[forme juridique]",
  siren: process.env.EDITEUR_SIREN ?? "[SIREN]",
  adresse: process.env.EDITEUR_ADRESSE ?? "[adresse du siège]",
  directeur: process.env.EDITEUR_DIRECTEUR ?? "[nom du directeur de la publication]",
  tva: process.env.EDITEUR_TVA ?? null,
  contact: process.env.COURRIEL_CONTACT ?? "contact@exemple.fr",
};

/** Vrai tant que l'exploitant n'a pas renseigné son identité : les pages légales le signalent. */
export const EDITEUR_A_COMPLETER = EDITEUR.raison_sociale.startsWith("[");

export const HEBERGEURS = [
  { nom: "Cloudflare, Inc.", role: "site", adresse: "101 Townsend St, San Francisco, CA 94107, États-Unis (serveurs en Europe)" },
  { nom: "Supabase (base de données)", role: "données", adresse: "Union européenne (région Francfort)" },
  { nom: "Brevo (envoi des courriels)", role: "courriels", adresse: "106 boulevard Haussmann, 75008 Paris" },
];
