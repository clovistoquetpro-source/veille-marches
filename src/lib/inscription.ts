/**
 * Inscription : le client ne donne que son SIRET et son adresse. On va chercher son entreprise dans
 * l'annuaire public, on regarde ce qu'elle a déjà gagné comme marchés, et on lui propose un profil
 * de veille qu'il n'a plus qu'à corriger.
 */
import type postgres from "postgres";
import { chercherEntreprise, type FicheAnnuaire } from "./annuaire";
import { type Compte, creerCompte, normaliserEmail } from "./comptes";
import { profilParIa } from "./ia";
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

/** Crée le compte et son profil de veille. */
export async function inscrire(
  sql: postgres.Sql,
  saisie: { identifiant: string; email: string },
): Promise<Inscription> {
  const email = normaliserEmail(saisie.email);
  if (!email) return { ok: false, erreur: "Cette adresse électronique n'est pas valable." };
  const numero = saisie.identifiant.replace(/\D/g, "");
  if (numero.length !== 9 && numero.length !== 14) {
    return { ok: false, erreur: "Un SIRET fait 14 chiffres (un SIREN, 9). Il figure sur vos factures." };
  }
  const entreprise = await chercherEntreprise(numero);
  if (!entreprise) {
    return { ok: false, erreur: "Aucune entreprise ne porte ce numéro dans l'annuaire des entreprises." };
  }
  const profil = await profilPropose(sql, entreprise);
  const compte = await creerCompte(sql, {
    email,
    siren: entreprise.siren,
    siret: entreprise.siret,
    nom: entreprise.nom,
  });
  await enregistrerProfil(sql, compte.id, profil);
  return { ok: true, compte, profil, entreprise };
}
