/**
 * Inscription : le client donne son SIRET, son adresse et un mot de passe. On va chercher son entreprise dans
 * l'annuaire public, on regarde ce qu'elle a déjà gagné comme marchés, et on lui propose un profil
 * de veille qu'il n'a plus qu'à corriger.
 */
import type postgres from "postgres";
import { chercherEntreprise, type FicheAnnuaire, INDISPONIBLE } from "./annuaire";
import { ouvrirEssai } from "./abonnements";
import { adresseInscrite, type Compte, creerCompte, normaliserEmail } from "./comptes";
import { profilParIa } from "./ia";
import { hacherMotDePasse, motDePasseRefuse } from "./motdepasse";
import {
  enregistrerProfil, historiqueEntreprise, type Profil, profilDepuisHistorique, profilDepuisNaf,
} from "./profil";

export type Inscription =
  | { ok: true; compte: Compte; profil: Profil; entreprise: FicheAnnuaire }
  | { ok: false; erreur: string };

/** Libellé INSEE d'un code NAF (« 81.22Z » → « Autres activités de nettoyage… »). */
async function libelleNaf(sql: postgres.Sql, code: string | null): Promise<string | null> {
  if (!code) return null;
  const [ligne] = await sql<{ libelle: string }[]>`select libelle from naf where code = ${code}`;
  return ligne?.libelle ?? null;
}

/**
 * Profil proposé à une entreprise : ses marchés déjà gagnés s'il y en a, sinon une déduction de
 * l'IA à partir de son activité, sinon les mots de son activité déclarée.
 */
export async function profilPropose(sql: postgres.Sql, fiche: FicheAnnuaire): Promise<Profil> {
  const historique = await historiqueEntreprise(sql, fiche.siren);
  const naf = await libelleNaf(sql, fiche.naf ?? historique.naf);
  const profil = profilDepuisHistorique(historique)
    ?? await profilParIa({ nom: fiche.nom ?? historique.nom, naf_libelle: naf, objets: historique.objets })
    ?? profilDepuisNaf(naf);
  // Sans historique, on propose le département de l'établissement : la plupart des PME répondent
  // près de chez elles, et le client peut en ajouter ou tout enlever. Une entreprise qui a déjà
  // gagné partout en France garde une veille nationale.
  if (profil.origine !== "historique" && profil.departements.length === 0 && fiche.departement) {
    profil.departements = [fiche.departement];
  }
  return profil;
}

/**
 * Repli quand l'annuaire ne répond pas : notre base Sirene contient déjà toutes les entreprises
 * vues dans un marché ou un avis, celles qui ont le plus de chances de s'inscrire. Elle ne donne
 * pas le département : le profil proposé reste national, le client le corrige.
 */
export async function ficheLocale(sql: postgres.Sql, numero: string): Promise<FicheAnnuaire | null> {
  const siren = numero.slice(0, 9);
  const [entreprise] = await sql<{ nom: string | null; naf: string | null; active: boolean; diffusible: boolean }[]>`
    select nom, naf, active, diffusible from entreprises where siren = ${siren}`;
  if (!entreprise) return null;
  return {
    siren,
    siret: numero.length === 14 ? numero : null,
    nom: entreprise.diffusible ? entreprise.nom : null,
    naf: entreprise.naf,
    departement: null,
    commune: null,
    active: entreprise.active,
  };
}

export const ADRESSE_DEJA_INSCRITE =
  "Un compte existe déjà avec cette adresse. Connectez-vous, ou choisissez un mot de passe avec « Mot de passe oublié ».";

/** Crée le compte et son profil de veille. */
export async function inscrire(
  sql: postgres.Sql,
  saisie: { identifiant: string; email: string; motDePasse: string },
  annuaire = chercherEntreprise,
): Promise<Inscription> {
  const numero = saisie.identifiant.replace(/\D/g, "");
  if (numero.length !== 9 && numero.length !== 14) {
    return { ok: false, erreur: "Un SIRET fait 14 chiffres (un SIREN, 9). Il figure sur vos factures." };
  }
  const email = normaliserEmail(saisie.email);
  if (!email) return { ok: false, erreur: "Cette adresse électronique n'est pas valable." };
  const refus = motDePasseRefuse(saisie.motDePasse);
  if (refus) return { ok: false, erreur: refus };
  // avant l'annuaire et l'IA, qui prennent plusieurs secondes
  if (await adresseInscrite(sql, email)) return { ok: false, erreur: ADRESSE_DEJA_INSCRITE };
  let entreprise = await annuaire(numero);
  if (entreprise === INDISPONIBLE) entreprise = await ficheLocale(sql, numero) ?? INDISPONIBLE;
  if (entreprise === INDISPONIBLE) {
    return { ok: false, erreur: "L'annuaire des entreprises ne répond pas pour l'instant. Réessayez dans une minute." };
  }
  if (!entreprise) {
    return { ok: false, erreur: "Aucune entreprise ne porte ce numéro dans l'annuaire des entreprises." };
  }
  const profil = await profilPropose(sql, entreprise);
  const compte = await creerCompte(sql, {
    email,
    siren: entreprise.siren,
    siret: entreprise.siret,
    nom: entreprise.nom,
    motDePasse: await hacherMotDePasse(saisie.motDePasse),
  });
  // deux inscriptions simultanées avec la même adresse : la seconde s'arrête là
  if (!compte) return { ok: false, erreur: ADRESSE_DEJA_INSCRITE };
  await enregistrerProfil(sql, compte.id, profil);
  await ouvrirEssai(sql, compte.id);
  return { ok: true, compte, profil, entreprise };
}
