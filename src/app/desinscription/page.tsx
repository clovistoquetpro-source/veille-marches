import Link from "next/link";
import { desinscrire } from "@/lib/comptes";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Désinscription" };

type Props = { searchParams: Promise<{ jeton?: string }> };

export default async function PageDesinscription({ searchParams }: Props) {
  const { jeton } = await searchParams;
  const sql = db();
  if (!sql) return <p className="p-8">Base de données non configurée (variable DATABASE_URL).</p>;
  const coupe = jeton ? await desinscrire(sql, jeton).finally(() => sql.end()) : false;
  if (!jeton) await sql.end();

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">{coupe ? "C'est fait" : "Lien non reconnu"}</h1>
      <p className="mt-3 text-sm text-gray-700">
        {coupe
          ? "Vous ne recevrez plus d'alertes. Votre veille reste consultable sur le site, et vous pourrez les rallumer quand vous voudrez."
          : "Ce lien de désinscription n'est plus valable. Vous pouvez couper les alertes depuis votre veille."}
      </p>
      <p className="mt-4">
        <Link href="/veille" className="underline">Voir ma veille</Link>
      </p>
    </main>
  );
}
