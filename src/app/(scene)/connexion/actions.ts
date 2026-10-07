"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSION, ouvrirSession } from "@/lib/comptes";
import { connecter, demanderReinitialisation, reinitialiserMotDePasse } from "@/lib/connexion";
import { envoyeurBrevo, envoyeurConsole } from "@/lib/courriel";
import { db } from "@/lib/db";
import { inscrire } from "@/lib/inscription";

export type EtatFormulaire = { erreur?: string; message?: string };

const SANS_BASE = { erreur: "Base de données non configurée (variable DATABASE_URL)." };

function champ(formulaire: FormData, nom: string): string {
  return String(formulaire.get(nom) ?? "");
}

/** Dépose le cookie de session : le client reste connecté un mois. */
async function deposerSession(session: string) {
  (await cookies()).set(COOKIE_SESSION, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * Adresse du site pour le lien du courriel : SITE_URL si elle est réglée, sinon l'hôte de la requête.
 * Jamais X-Forwarded-Host : n'importe qui peut l'écrire, et un lien qui pointerait vers un autre site
 * livrerait le jeton à un inconnu. L'en-tête Host, lui, est celui par lequel Cloudflare a routé la requête.
 */
async function adresseDuSite(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const hote = (await headers()).get("host") ?? "localhost:3000";
  return `${/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hote) ? "http" : "https"}://${hote}`;
}

export async function actionConnexion(_etat: EtatFormulaire, formulaire: FormData): Promise<EtatFormulaire> {
  const sql = db();
  if (!sql) return SANS_BASE;
  let session: string;
  try {
    const resultat = await connecter(sql, { email: champ(formulaire, "email"), motDePasse: champ(formulaire, "motDePasse") });
    if (!resultat.ok) return { erreur: resultat.erreur };
    session = await ouvrirSession(sql, resultat.compte.id);
  } finally {
    await sql.end();
  }
  await deposerSession(session);
  redirect("/veille");
}

/** Crée le compte, prépare son profil de veille et l'ouvre. */
export async function actionCreation(_etat: EtatFormulaire, formulaire: FormData): Promise<EtatFormulaire> {
  const sql = db();
  if (!sql) return SANS_BASE;
  let session: string;
  try {
    const resultat = await inscrire(sql, {
      identifiant: champ(formulaire, "siret"),
      email: champ(formulaire, "email"),
      motDePasse: champ(formulaire, "motDePasse"),
    });
    if (!resultat.ok) return { erreur: resultat.erreur };
    session = await ouvrirSession(sql, resultat.compte.id);
  } finally {
    await sql.end();
  }
  await deposerSession(session);
  redirect("/veille");
}

export async function actionOubli(_etat: EtatFormulaire, formulaire: FormData): Promise<EtatFormulaire> {
  const sql = db();
  if (!sql) return SANS_BASE;
  try {
    await demanderReinitialisation(
      sql,
      { email: champ(formulaire, "email"), site: await adresseDuSite() },
      envoyeurBrevo() ?? envoyeurConsole,
    );
  } catch (erreur) {
    console.error("Lien de nouveau mot de passe non envoyé :", erreur);
    return { erreur: "Le courriel n'a pas pu partir. Réessayez dans un instant." };
  } finally {
    await sql.end();
  }
  return {
    message: "Si un compte existe pour cette adresse, un lien vient de partir. Pensez à regarder dans les indésirables.",
  };
}

export async function actionNouveauMotDePasse(_etat: EtatFormulaire, formulaire: FormData): Promise<EtatFormulaire> {
  const sql = db();
  if (!sql) return SANS_BASE;
  let session: string;
  try {
    const resultat = await reinitialiserMotDePasse(sql, {
      jeton: champ(formulaire, "jeton"),
      motDePasse: champ(formulaire, "motDePasse"),
    });
    if (!resultat.ok) return { erreur: resultat.erreur };
    session = await ouvrirSession(sql, resultat.compte.id);
  } finally {
    await sql.end();
  }
  await deposerSession(session);
  redirect("/veille");
}
