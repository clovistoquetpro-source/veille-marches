import Link from "next/link";
import { lienValable } from "@/lib/connexion";
import { db } from "@/lib/db";
import { FormulaireNouveau } from "./formulaire";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouveau mot de passe" };

/** Page ouverte depuis le lien du courriel « Mot de passe oublié ». */
export default async function PageNouveauMotDePasse({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  const sql = db();
  const valable = jeton && sql ? await lienValable(sql, jeton).finally(() => sql.end()) : false;
  return (
    <section className="pointer-events-none relative z-10 grid flex-1 place-items-center px-4 py-2">
      <div className="apparition verre verre-dense pointer-events-auto w-full max-w-[400px] rounded-[28px] p-5 sm:p-7">
        {valable && jeton ? (
          <FormulaireNouveau jeton={jeton} />
        ) : (
          <>
            <h1 className="text-[26px] leading-tight police-titre font-semibold tracking-[-0.02em]">Lien expiré</h1>
            <p className="mt-1.5 text-sm text-texte-doux">
              Ce lien a déjà servi ou date de plus d&apos;une heure. Demandez-en un nouveau, il arrive en quelques secondes.
            </p>
            <Link href="/connexion?mode=oubli" className="bouton-principal mt-6 flex items-center justify-center">
              Recevoir un nouveau lien
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
