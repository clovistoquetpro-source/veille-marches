import { notFound } from "next/navigation";
import { cache } from "react";
import { Barres } from "@/components/barres";
import { Chiffre, Section } from "@/components/fiche";
import { LienEntreprise, ListeTitulaires } from "@/components/liens";
import { Sources } from "@/components/sources";
import { ficheAcheteur } from "@/lib/acheteurs";
import { db } from "@/lib/db";
import { euros, jour, mois, nombre } from "@/lib/format";
import { libelleDivision, libelleTypeAvis } from "@/lib/nomenclatures";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ siret: string }> };

/** Une seule requête par page, partagée entre le titre et le contenu. */
const charger = cache(async (siret: string) => {
  if (!/^\d{14}$/.test(siret)) notFound();
  const sql = db();
  if (!sql) throw new Error("Base de données non configurée (variable DATABASE_URL).");
  const fiche = await ficheAcheteur(sql, siret).finally(() => sql.end());
  if (!fiche) notFound();
  return fiche;
});

export async function generateMetadata({ params }: Props) {
  const f = await charger((await params).siret);
  return { title: `${f.nom ?? f.siret} : marchés publics` };
}

export default async function PageAcheteur({ params }: Props) {
  const { siret } = await params;
  const f = await charger(siret);
  const annees = f.par_annee.filter((a) => a.annee >= 2018);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <p className="text-sm text-gray-600">Acheteur public</p>
      <h1 className="text-2xl font-semibold">{f.nom ?? `Acheteur ${f.siret}`}</h1>
      <p className="mt-1 text-sm text-gray-600">
        {[f.categorie, f.departement && `département ${f.departement}`, `SIRET ${f.siret}`].filter(Boolean).join(" · ")}
      </p>

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Chiffre titre="Marchés notifiés" valeur={nombre(f.marches)} detail={f.premiere ? `depuis ${mois(f.premiere)}` : undefined} />
        <Chiffre titre="Montant total" valeur={euros(f.montant)} />
        <Chiffre
          titre="Offres reçues en moyenne"
          valeur={f.offres_moyennes ? f.offres_moyennes.toFixed(1).replace(".", ",") : "non publié"}
          detail={f.marches_avec_offres > 0 ? `sur ${nombre(f.marches_avec_offres)} marchés renseignés` : undefined}
        />
        <Chiffre
          titre="Une seule offre"
          valeur={f.marches_avec_offres > 0 ? `${Math.round((100 * f.offre_unique) / f.marches_avec_offres)} %` : "non publié"}
          detail={f.marches_avec_offres > 0 ? "des marchés renseignés" : undefined}
        />
      </section>

      <Section titre={`Prochains renouvellements (${f.renouvellements.length})`}>
        {f.renouvellements.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun marché de services ou de fournitures n&apos;arrive à échéance dans les 12 mois.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Fin estimée</th>
                <th className="py-2 pr-3">Objet</th>
                <th className="py-2 pr-3 text-right">Montant</th>
                <th className="py-2">Titulaire actuel</th>
              </tr>
            </thead>
            <tbody>
              {f.renouvellements.map((r) => (
                <tr key={r.uid} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{mois(r.date_fin_estimee)}</td>
                  <td className="py-2 pr-3">
                    {r.objet ?? "Objet non publié"}
                    {r.deja_relance_le && (
                      <span className="mt-1 block text-xs text-amber-700">Marché similaire déjà notifié le {jour(r.deja_relance_le)}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{euros(r.montant)}</td>
                  <td className="py-2"><ListeTitulaires titulaires={r.titulaires} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {f.avis.length > 0 && (
        <Section titre="Derniers avis publiés">
          <ul className="space-y-2 text-sm">
            {f.avis.map((a) => (
              <li key={a.uid}>
                <span className="text-gray-600">{jour(a.date_publication)} · {libelleTypeAvis(a.type)} · </span>
                <a href={a.url} className="underline" target="_blank" rel="noreferrer">{a.objet}</a>
                {a.date_limite && a.type === "marche" && <span className="text-gray-600"> · réponse avant le {jour(a.date_limite)}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section titre="Ce qu'il achète">
        <Barres lignes={f.divisions.map((d) => ({ ...d, libelle: libelleDivision(d.division) }))} />
      </Section>

      <Section titre="Ses titulaires les plus fréquents">
        <table className="w-full text-sm">
          <tbody>
            {f.titulaires.map((t) => (
              <tr key={t.siren ?? t.identifiant} className="border-b">
                <td className="py-2 pr-3"><LienEntreprise siren={t.siren} nom={t.nom} id={t.identifiant} /></td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">{t.marches} marché{t.marches > 1 ? "s" : ""}</td>
                <td className="py-2 text-right whitespace-nowrap">{euros(t.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section titre="Montants notifiés par année">
        <Barres lignes={annees.map((a) => ({ ...a, libelle: String(a.annee) }))} />
      </Section>

      <Sources />
    </main>
  );
}
