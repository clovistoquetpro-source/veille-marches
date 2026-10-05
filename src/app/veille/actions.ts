"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { compteDeLaSession, COOKIE_SESSION, fermerSession } from "@/lib/comptes";
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
