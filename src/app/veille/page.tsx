import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Section } from "@/components/fiche";
import { LienEntreprise, ListeTitulaires } from "@/components/liens";
import { Sources } from "@/components/sources";
import { avisDuProfil, profilVide, renouvellementsDuProfil } from "@/lib/correspondance";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { db } from "@/lib/db";
import { euros, jour, mois } from "@/lib/format";
import { profilDuCompte } from "@/lib/profil";
import { actionDeconnexion } from "./actions";
import { PanneauProfil } from "./profil-formulaire";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma veille" };

export default async function PageVeille() {
  const sql = db();
  if (!sql) return <p className="p-8">Base de données non configurée (variable DATABASE_URL).</p>;
  const session = (await cookies()).get(COOKIE_SESSION)?.value;
  const donnees = await (async () => {
    const compte = await compteDeLaSession(sql, session);
    if (!compte) return null;
    const profil = (await profilDuCompte(sql, compte.id))
      ?? { cpv: [], mots_cles: [], departements: [], origine: "manuel" as const, frequence: "quotidienne" as const };
    const [avis, renouvellements] = await Promise.all([
      avisDuProfil(sql, profil, 30),
      renouvellementsDuProfil(sql, profil, 30),
    ]);
    return { compte, profil, avis, renouvellements };
  })().finally(() => sql.end());
  if (!donnees) redirect("/inscription");
  const { compte, profil, avis, renouvellements } = donnees;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm text-gray-600">Ma veille</p>
          <h1 className="text-2xl font-semibold">{compte.nom ?? compte.email}</h1>
        </div>
        <form action={actionDeconnexion}>
          <button className="text-sm text-gray-600 underline">Se déconnecter</button>
        </form>
      </div>

      <PanneauProfil profil={profil} ouvert={avis.length === 0} />

      {profilVide(profil) && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Nous n&apos;avons pas réussi à deviner ce que vous cherchez. Indiquez au moins un code CPV ou un
          mot-clé ci-dessus pour voir vos marchés.
        </p>
      )}

      <Section titre={`Appels d'offres en cours (${avis.length})`}>
        {avis.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun avis en cours ne correspond pour l&apos;instant. Ils arrivent chaque matin.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Publié</th>
                <th className="py-2 pr-3">Objet</th>
                <th className="py-2 pr-3">Acheteur</th>
                <th className="py-2">Réponse avant</th>
              </tr>
            </thead>
            <tbody>
              {avis.map((a) => (
                <tr key={a.uid} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{jour(a.date_publication)}</td>
                  <td className="py-2 pr-3">
                    <a href={a.url} target="_blank" rel="noreferrer" className="underline decoration-gray-300 hover:decoration-gray-900">{a.objet}</a>
                    <span className="block text-xs text-gray-500">
                      {[a.departements.join(", "), a.cpv && `CPV ${a.cpv}`].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{a.acheteur_nom ?? "Acheteur non publié"}</td>
                  <td className="py-2 whitespace-nowrap">{jour(a.date_limite)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section titre={`Marchés à reconquérir dans les 12 mois (${renouvellements.length})`}>
        <p className="mb-2 text-sm text-gray-600">
          Ces marchés arrivent à échéance : c&apos;est maintenant qu&apos;il faut aller voir l&apos;acheteur, avant que l&apos;avis ne paraisse.
        </p>
        {renouvellements.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun marché correspondant n&apos;arrive à échéance dans les 12 mois.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Fin estimée</th>
                <th className="py-2 pr-3">Objet</th>
                <th className="py-2 pr-3">Acheteur</th>
                <th className="py-2 pr-3 text-right">Montant</th>
                <th className="py-2">Titulaire actuel</th>
              </tr>
            </thead>
            <tbody>
              {renouvellements.map((r) => (
                <tr key={r.uid} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{mois(r.date_fin_estimee)}</td>
                  <td className="py-2 pr-3">{r.objet ?? "Objet non publié"}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/acheteurs/${r.acheteur}`} className="underline">{r.acheteur_nom ?? r.acheteur}</Link>
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{euros(r.montant)}</td>
                  <td className="py-2"><ListeTitulaires titulaires={r.titulaires} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {compte.siren && (
        <p className="mt-6 text-sm text-gray-600">
          Votre entreprise : <LienEntreprise siren={compte.siren} nom={compte.nom} id={compte.siren} />
        </p>
      )}
      <Sources />
    </main>
  );
}
