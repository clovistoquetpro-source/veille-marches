"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSION, ouvrirSession } from "@/lib/comptes";
import { db } from "@/lib/db";
import { inscrire } from "@/lib/inscription";

export type EtatInscription = { erreur?: string };

/** Inscrit le client, ouvre sa session et l'emmène sur sa veille. */
export async function actionInscription(_etat: EtatInscription, formulaire: FormData): Promise<EtatInscription> {
  const sql = db();
  if (!sql) return { erreur: "Base de données non configurée (variable DATABASE_URL)." };
  let session: string;
  try {
    const resultat = await inscrire(sql, {
      identifiant: String(formulaire.get("siret") ?? ""),
      email: String(formulaire.get("email") ?? ""),
    });
    if (!resultat.ok) return { erreur: resultat.erreur };
    session = await ouvrirSession(sql, resultat.compte.id);
  } finally {
    await sql.end();
  }
  (await cookies()).set(COOKIE_SESSION, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/veille");
}
