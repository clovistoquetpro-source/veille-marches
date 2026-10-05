import { notFound } from "next/navigation";
import { cache } from "react";
import { Barres } from "@/components/barres";
import { Chiffre, Section } from "@/components/fiche";
import { LienAcheteur } from "@/components/liens";
import { Sources } from "@/components/sources";
import { db } from "@/lib/db";
import { ficheEntreprise } from "@/lib/entreprises";
import { euros, jour, mois, nombre } from "@/lib/format";
import { libelleDivision, libelleEffectif } from "@/lib/nomenclatures";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ siren: string }> };

/** Une seule requête par page, partagée entre le titre et le contenu. */
const charger = cache(async (siren: string) => {
  if (!/^\d{9}$/.test(siren)) notFound();
  const sql = db();
  if (!sql) throw new Error("Base de données non configurée (variable DATABASE_URL).");
  const fiche = await ficheEntreprise(sql, siren).finally(() => sql.end());
  if (!fiche) notFound();
  return fiche;
});

function nomAffiche(f: { nom: string | null; diffusible: boolean | null; siren: string }) {
  if (f.diffusible === false) return "Entrepreneur individuel (nom non diffusé)";
  return f.nom ?? `Entreprise ${f.siren}`;
}

export async function generateMetadata({ params }: Props) {
  const f = await charger((await params).siren);
  return { title: `${nomAffiche(f)} : marchés publics gagnés` };
}

export default async function PageEntreprise({ params }: Props) {
  const { siren } = await params;
  const f = await charger(siren);
  const annees = f.par_annee.filter((a) => a.annee >= 2018);
  const description = [
    f.categorie_juridique,
    f.naf_libelle && `${f.naf_libelle} (${f.naf})`,
    libelleEffectif(f.tranche_effectif),
    f.date_creation && `créée en ${f.date_creation.slice(0, 4)}`,
    `SIREN ${f.siren}`,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <p className="text-sm text-gray-600">Entreprise titulaire de marchés publics</p>
      <h1 className="text-2xl font-semibold">{nomAffiche(f)}</h1>
      <p className="mt-1 text-sm text-gray-600">{description.join(" · ")}</p>
      {f.active === false && <p className="mt-1 text-sm text-red-700">Entreprise fermée selon la base Sirene.</p>}

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Chiffre titre="Marchés gagnés" valeur={nombre(f.marches)} detail={f.premiere ? `depuis ${mois(f.premiere)}` : undefined} />
        <Chiffre titre="Montant total" valeur={euros(f.montant)} />
        <Chiffre titre="Acheteurs différents" valeur={nombre(f.nb_acheteurs)} />
        <Chiffre titre="Marchés qui arrivent à échéance" valeur={nombre(f.echeances.length)} detail="dans les 12 mois" />
      </section>

      <Section titre="Ses marchés qui arrivent à échéance">
        {f.echeances.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun de ses marchés de services ou de fournitures ne se termine dans les 12 mois.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Fin estimée</th>
                <th className="py-2 pr-3">Objet</th>
                <th className="py-2 pr-3">Acheteur</th>
                <th className="py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {f.echeances.map((e) => (
                <tr key={e.uid} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{mois(e.date_fin_estimee)}</td>
                  <td className="py-2 pr-3">
                    {e.objet ?? "Objet non publié"}
                    {e.deja_relance_le && (
                      <span className="mt-1 block text-xs text-amber-700">Marché similaire déjà notifié le {jour(e.deja_relance_le)}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3"><LienAcheteur siret={e.acheteur_siret} nom={e.acheteur_nom} /></td>
                  <td className="py-2 text-right whitespace-nowrap">{euros(e.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {f.attributions.length > 0 && (
        <Section titre="Dernières attributions publiées">
          <ul className="space-y-2 text-sm">
            {f.attributions.map((a) => (
              <li key={a.uid}>
                <span className="text-gray-600">{jour(a.date_publication)} · </span>
                <a href={a.url} className="underline" target="_blank" rel="noreferrer">{a.objet}</a>
                <span className="text-gray-600">
                  {" · "}<LienAcheteur siret={a.acheteur_siret} nom={a.acheteur_nom} />
                  {a.montant ? ` · ${euros(a.montant)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section titre="Ses principaux acheteurs">
        <table className="w-full text-sm">
          <tbody>
            {f.acheteurs.map((a) => (
              <tr key={a.siret} className="border-b">
                <td className="py-2 pr-3"><LienAcheteur siret={a.siret} nom={a.nom} /></td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">{a.marches} marché{a.marches > 1 ? "s" : ""}</td>
                <td className="py-2 text-right whitespace-nowrap">{euros(a.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section titre="Ce qu'elle vend aux acheteurs publics">
        <Barres lignes={f.divisions.map((d) => ({ ...d, libelle: libelleDivision(d.division) }))} />
      </Section>

      <Section titre="Montants gagnés par année">
        <Barres lignes={annees.map((a) => ({ ...a, libelle: String(a.annee) }))} />
      </Section>

      <Sources />
    </main>
  );
}
