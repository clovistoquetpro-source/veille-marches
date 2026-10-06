"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { compteDeLaSession, COOKIE_SESSION, fermerSession } from "@/lib/comptes";
import {
  chercherConcurrents, concurrentsDuCompte, nePlusSuivre, suivreEntreprise, type Suggestion,
} from "@/lib/concurrents";
import { db } from "@/lib/db";
import { enregistrerProfil } from "@/lib/profil";

/** Une liste saisie par le client : « 90910, 79710 » ou une par ligne. */
function liste(valeur: FormDataEntryValue | null): string[] {
  return String(valeur ?? "").split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean);
}

export type EtatProfil = { message?: string; erreur?: string };

const FREQUENCES = ["quotidienne", "hebdomadaire", "aucune"] as const;

/** Enregistre le profil corrigé par le client. */
export async function actionProfil(_etat: EtatProfil, formulaire: FormData): Promise<EtatProfil> {
  const sql = db();
  if (!sql) return { erreur: "Base de données non configurée (variable DATABASE_URL)." };
  try {
    const compte = await compteDeLaSession(sql, (await cookies()).get(COOKIE_SESSION)?.value);
    if (!compte) return { erreur: "Votre session a expiré." };
    await enregistrerProfil(sql, compte.id, {
      cpv: liste(formulaire.get("cpv")),
      mots_cles: liste(formulaire.get("mots_cles")),
      departements: liste(formulaire.get("departements")).map((d) => d.toUpperCase()),
      origine: "manuel",
      frequence: FREQUENCES.find((f) => f === formulaire.get("frequence")) ?? "quotidienne",
    });
  } finally {
    await sql.end();
  }
  revalidatePath("/veille");
  return { message: "Votre veille est à jour." };
}

export async function actionDeconnexion(): Promise<void> {
  const boite = await cookies();
  const session = boite.get(COOKIE_SESSION)?.value;
  if (session) {
    const sql = db();
    if (sql) await fermerSession(sql, session).finally(() => sql.end());
  }
  boite.delete(COOKIE_SESSION);
  redirect("/");
}

export type EtatSuivi = { suivie?: boolean; erreur?: string };

/** Suit une entreprise, ou cesse de la suivre (`suivre` = « 1 » ou « 0 »). */
export async function actionSuivi(_etat: EtatSuivi, formulaire: FormData): Promise<EtatSuivi> {
  const siren = String(formulaire.get("siren") ?? "");
  const suivre = formulaire.get("suivre") === "1";
  const sql = db();
  if (!sql) return { erreur: "Base de données non configurée (variable DATABASE_URL)." };
  let etat: EtatSuivi;
  try {
    const compte = await compteDeLaSession(sql, (await cookies()).get(COOKIE_SESSION)?.value);
    if (!compte) return { erreur: "Connectez-vous pour suivre une entreprise." };
    if (suivre) {
      const resultat = await suivreEntreprise(sql, compte.id, siren);
      etat = resultat.ok ? { suivie: true } : { erreur: resultat.erreur };
    } else {
      await nePlusSuivre(sql, compte.id, siren);
      etat = { suivie: false };
    }
  } finally {
    await sql.end();
  }
  revalidatePath("/veille");
  if (/^\d{9}$/.test(siren)) revalidatePath(`/entreprises/${siren}`);
  return etat;
}

export type EtatRecherche = {
  resultats?: (Suggestion & { suivie: boolean })[];
  message?: string;
  erreur?: string;
};

/** Ajoute un concurrent : un numéro le suit tout de suite, un nom propose les entreprises qui y répondent. */
export async function actionRechercheConcurrent(_etat: EtatRecherche, formulaire: FormData): Promise<EtatRecherche> {
  const texte = String(formulaire.get("recherche") ?? "").trim();
  if (texte.length < 2) return { erreur: "Tapez au moins deux lettres du nom, ou le SIREN." };
  const sql = db();
  if (!sql) return { erreur: "Base de données non configurée (variable DATABASE_URL)." };
  try {
    const compte = await compteDeLaSession(sql, (await cookies()).get(COOKIE_SESSION)?.value);
    if (!compte) return { erreur: "Votre session a expiré." };
    if (/^[\d\s]+$/.test(texte)) {
      const resultat = await suivreEntreprise(sql, compte.id, texte);
      if (!resultat.ok) return { erreur: resultat.erreur };
      revalidatePath("/veille");
      return { message: "C'est noté : vous serez prévenu de ses prochains marchés." };
    }
    const [resultats, suivis] = await Promise.all([
      chercherConcurrents(sql, texte),
      concurrentsDuCompte(sql, compte.id),
    ]);
    if (resultats.length === 0) {
      return { erreur: "Aucune entreprise de ce nom n'a gagné de marché public récemment. Essayez avec son SIREN." };
    }
    const deja = new Set(suivis.map((s) => s.siren));
    return { resultats: resultats.map((r) => ({ ...r, suivie: deja.has(r.siren) })) };
  } finally {
    await sql.end();
  }
}
