import { db } from "@/lib/db";
import { listerRenouvellements } from "@/lib/renouvellements";

export const dynamic = "force-dynamic";
export const metadata = { title: "Renouvellements à venir" };

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const mois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const jour = new Intl.DateTimeFormat("fr-FR");

type Props = { searchParams: Promise<{ departement?: string; cpv?: string }> };

export default async function PageRenouvellements({ searchParams }: Props) {
  const { departement, cpv } = await searchParams;
  const sql = db();
  if (!sql) {
    return <p className="p-8">Base de données non configurée (variable DATABASE_URL).</p>;
  }
  const lignes = await listerRenouvellements(sql, {
    departement: departement?.trim().toUpperCase() || undefined,
    cpv: cpv?.trim() || undefined,
  }).finally(() => sql.end());

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Marchés qui arrivent à échéance dans les 12 mois</h1>
      <p className="mt-1 text-sm text-gray-600">
        Services et fournitures uniquement. Date de fin estimée = date de notification + durée publiée
        (reconductions comprises). Source : DECP.
      </p>

      <form className="mt-4 flex flex-wrap gap-3 text-sm">
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

      <p className="mt-4 text-sm">{lignes.length === 100 ? "100 premiers résultats" : `${lignes.length} résultats`}</p>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-3">Fin estimée</th>
            <th className="py-2 pr-3">Objet</th>
            <th className="py-2 pr-3">Acheteur</th>
            <th className="py-2 pr-3 text-right">Montant</th>
            <th className="py-2 pr-3">Titulaire actuel</th>
            <th className="py-2 text-right">Offres</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((r) => (
            <tr key={r.uid} className="border-b align-top">
              <td className="py-2 pr-3 whitespace-nowrap">{mois.format(new Date(r.date_fin_estimee))}</td>
              <td className="py-2 pr-3">
                {r.objet ?? "Objet non publié"}
                {r.deja_relance_le && (
                  <span className="mt-1 block text-xs text-amber-700">
                    Marché similaire déjà notifié le {jour.format(new Date(r.deja_relance_le))}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">{r.acheteur_nom ?? r.acheteur}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">{r.montant ? euros.format(r.montant) : "?"}</td>
              <td className="py-2 pr-3">{r.titulaires.join(", ")}</td>
              <td className="py-2 text-right">{r.offres_recues ?? "?"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
