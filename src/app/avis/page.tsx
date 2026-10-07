import Link from "next/link";
import { ListeTitulaires, LienAcheteur } from "@/components/liens";
import { Sources } from "@/components/sources";
import { listerAvis } from "@/lib/avis";
import { db } from "@/lib/db";
import { euros, jour } from "@/lib/format";
import { libelleTypeAvis } from "@/lib/nomenclatures";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avis publiés" };

type Props = { searchParams: Promise<{ departement?: string; cpv?: string; type?: string; q?: string }> };

const TYPES = [
  ["marche", "Appels d'offres"],
  ["attribution", "Attributions"],
  ["preinformation", "Pré-informations"],
  ["", "Tous"],
] as const;

export default async function PageAvis({ searchParams }: Props) {
  const { departement, cpv, type = "marche", q } = await searchParams;
  const sql = db();
  if (!sql) return <p className="p-8">Base de données non configurée (variable DATABASE_URL).</p>;
  const avis = await listerAvis(sql, {
    departement: departement?.trim().toUpperCase() || undefined,
    cpv: cpv?.trim() || undefined,
    type: type || undefined,
    texte: q?.trim() || undefined,
  }).finally(() => sql.end());

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Avis publiés</h1>
      <p className="mt-1 text-sm text-gray-600">
        Avis nationaux du BOAMP et avis européens de TED, mis à jour toutes les 2 heures en journée. Les rectificatifs sont masqués.
      </p>

      <form className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <select name="type" defaultValue={type} className="rounded border px-2 py-1">
          {TYPES.map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>{libelle}</option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          Mots-clés
          <input name="q" defaultValue={q} placeholder="nettoyage" className="w-40 rounded border px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">
          Département
          <input name="departement" defaultValue={departement} placeholder="69" className="w-20 rounded border px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">
          Code CPV commence par
          <input name="cpv" defaultValue={cpv} placeholder="90" className="w-28 rounded border px-2 py-1" />
        </label>
        <button className="rounded bg-gray-900 px-3 py-1 text-white">Filtrer</button>
      </form>

      <p className="mt-4 text-sm">{avis.length === 100 ? "100 avis les plus récents" : `${avis.length} avis`}</p>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-3">Publié</th>
            <th className="py-2 pr-3">Objet</th>
            <th className="py-2 pr-3">Acheteur</th>
            <th className="py-2 pr-3">{type === "attribution" ? "Titulaire" : "Réponse avant"}</th>
            <th className="py-2 text-right">Montant</th>
          </tr>
        </thead>
        <tbody>
          {avis.map((a) => (
            <tr key={a.uid} className="border-b align-top">
              <td className="py-2 pr-3 whitespace-nowrap">
                {jour(a.date_publication)}
                <span className="block text-xs text-gray-500">{a.source === "ted" ? "TED" : "BOAMP"}</span>
              </td>
              <td className="py-2 pr-3">
                <a href={a.url} target="_blank" rel="noreferrer" className="underline decoration-gray-300 hover:decoration-gray-900">{a.objet}</a>
                <span className="block text-xs text-gray-500">
                  {[type === "" && libelleTypeAvis(a.type), a.departements.join(", "), a.cpv && `CPV ${a.cpv}`].filter(Boolean).join(" · ")}
                </span>
                {a.type === "marche" && (
                  <Link href={`/candidature/${encodeURIComponent(a.uid)}`} className="mt-1 inline-block text-xs underline">
                    Préparer mes DC1 et DC2
                  </Link>
                )}
              </td>
              <td className="py-2 pr-3"><LienAcheteur siret={a.acheteur_siret} nom={a.acheteur_nom} /></td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {a.type === "attribution" ? <ListeTitulaires titulaires={a.titulaires} /> : jour(a.date_limite)}
              </td>
              <td className="py-2 text-right whitespace-nowrap">{euros(a.montant)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Sources />
    </main>
  );
}
