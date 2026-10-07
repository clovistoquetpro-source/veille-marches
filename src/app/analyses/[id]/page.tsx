import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Section } from "@/components/fiche";
import { analyseDuCompte, VERDICTS, type Exigence } from "@/lib/analyse";
import { avisPourCandidature } from "@/lib/candidature";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { db } from "@/lib/db";
import { jour } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analyse du dossier" };

type Props = { params: Promise<{ id: string }> };

const STATUTS: Record<Exigence["statut"], { texte: string; couleur: string }> = {
  rempli: { texte: "OK", couleur: "text-emerald-700" },
  a_verifier: { texte: "À vérifier", couleur: "text-amber-700" },
  manquant: { texte: "Manquant", couleur: "text-rose-700" },
};

function Liste({ elements, vide }: { elements: string[]; vide: string }) {
  if (elements.length === 0) return <p className="text-sm text-gray-500">{vide}</p>;
  return <ul className="list-disc space-y-1 pl-5 text-sm">{elements.map((e, i) => <li key={i}>{e}</li>)}</ul>;
}

export default async function PageAnalyse({ params }: Props) {
  const { id } = await params;
  const sql = db();
  if (!sql) return <p className="p-8">Base de données non configurée (variable DATABASE_URL).</p>;
  const session = (await cookies()).get(COOKIE_SESSION)?.value;
  const donnees = await (async () => {
    const compte = await compteDeLaSession(sql, session);
    if (!compte) return "connexion" as const;
    const analyse = await analyseDuCompte(sql, compte.id, id);
    if (!analyse) return null;
    return { analyse, avis: await avisPourCandidature(sql, analyse.avis_uid) };
  })().finally(() => sql.end());
  if (donnees === "connexion") redirect("/connexion");
  if (!donnees) notFound();
  const { analyse, avis } = donnees;
  const r = analyse.resultat;
  const verdict = VERDICTS[r.verdict];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="text-sm text-gray-600">
        <Link href="/veille" className="underline">Ma veille</Link>
        {" › "}<Link href={`/candidature/${encodeURIComponent(analyse.avis_uid)}`} className="underline">Préparer ma candidature</Link>
        {" › "}Analyse du {jour(analyse.cree_le)}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{avis?.objet ?? "Analyse du dossier"}</h1>
      {avis && <p className="mt-1 text-sm text-gray-600">{avis.acheteur_nom ?? "Acheteur non indiqué"}{avis.date_limite && ` · réponse avant le ${jour(avis.date_limite)}`}</p>}

      <div className={`mt-6 rounded border p-4 ${verdict.couleur}`}>
        <p className="text-lg font-semibold">{verdict.titre}</p>
        <p className="mt-1 text-sm">{r.resume}</p>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">Pour</h2>
          <Liste elements={r.raisons_pour} vide="Rien de particulier." />
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Contre</h2>
          <Liste elements={r.raisons_contre} vide="Rien de particulier." />
        </div>
      </div>

      <Section titre="Conditions à remplir">
        {r.exigences.length === 0 ? <p className="text-sm text-gray-500">Aucune exigence particulière relevée.</p> : (
          <table className="w-full text-sm">
            <tbody>
              {r.exigences.map((e, i) => (
                <tr key={i} className="border-b align-top">
                  <td className="py-2 pr-3">
                    {e.exigence}
                    {e.eliminatoire && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-800">éliminatoire</span>}
                  </td>
                  <td className={`py-2 whitespace-nowrap text-right font-medium ${STATUTS[e.statut].couleur}`}>{STATUTS[e.statut].texte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section titre="Dates à retenir">
        {r.dates.length === 0 ? <p className="text-sm text-gray-500">Non précisé dans le dossier.</p> : (
          <dl className="text-sm">
            {r.dates.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-3 border-b py-1.5"><dt>{d.quoi}</dt><dd className="font-medium">{d.quand}</dd></div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-sm"><span className="text-gray-600">Durée et montant : </span>{r.montant_duree}</p>
      </Section>

      <Section titre="Comment l'acheteur choisira">
        {r.criteres.length === 0 ? <p className="text-sm text-gray-500">Non précisé dans le dossier.</p> : (
          <dl className="text-sm">
            {r.criteres.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-3 border-b py-1.5"><dt>{c.critere}</dt><dd className="font-medium">{c.poids}</dd></div>
            ))}
          </dl>
        )}
      </Section>

      <Section titre="Pièces à fournir">
        <Liste elements={r.pieces_a_fournir} vide="Non précisé dans le dossier." />
        <p className="mt-2 text-sm">
          <Link href={`/candidature/${encodeURIComponent(analyse.avis_uid)}`} className="underline">Télécharger mes DC1 et DC2 pré-remplis</Link>
        </p>
      </Section>

      {r.questions_acheteur.length > 0 && (
        <Section titre="Questions à poser à l'acheteur">
          <Liste elements={r.questions_acheteur} vide="" />
        </Section>
      )}

      <p className="mt-8 text-xs text-gray-500">
        Analyse faite par une IA à partir de : {analyse.fichiers.join(", ")}. Elle peut se tromper ou oublier un point :
        relisez le règlement de la consultation avant de décider.
      </p>
    </main>
  );
}
