import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Section } from "@/components/fiche";
import { abonnementDuCompte, accesOuvert, joursDEssai } from "@/lib/abonnements";
import { LienAcheteur, LienEntreprise, ListeTitulaires } from "@/components/liens";
import { Sources } from "@/components/sources";
import { avisDuProfil, profilVide, renouvellementsDuProfil } from "@/lib/correspondance";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { concurrentsDuCompte, concurrentsProbables, gainsDesConcurrents } from "@/lib/concurrents";
import { db } from "@/lib/db";
import { euros, jour, mois } from "@/lib/format";
import { profilDuCompte } from "@/lib/profil";
import { actionDeconnexion } from "./actions";
import { BoutonSuivi, RechercheConcurrent } from "./concurrents";
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
    const [avis, renouvellements, abonnement, concurrents, gains] = await Promise.all([
      avisDuProfil(sql, profil, 30),
      renouvellementsDuProfil(sql, profil, 30),
      abonnementDuCompte(sql, compte.id),
      concurrentsDuCompte(sql, compte.id),
      gainsDesConcurrents(sql, compte.id, { limite: 12 }),
    ]);
    // tant que le client suit peu d'entreprises, on lui propose celles qui gagnent ses marchés
    const suggestions = concurrents.length < 3 ? await concurrentsProbables(sql, compte.id, profil, compte.siren) : [];
    return { compte, profil, avis, renouvellements, abonnement, concurrents, gains, suggestions };
  })().finally(() => sql.end());
  if (!donnees) redirect("/connexion");
  const { compte, profil, avis, renouvellements, abonnement, concurrents, gains, suggestions } = donnees;
  const jours = joursDEssai(abonnement);

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

      {!accesOuvert(abonnement) ? (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Votre essai est terminé : vos alertes ne partent plus.{" "}
          <Link href="/abonnement" className="underline">Reprendre l&apos;abonnement</Link>.
        </p>
      ) : jours !== null && jours <= 5 ? (
        <p className="mt-4 rounded border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
          Il vous reste {jours} jour{jours > 1 ? "s" : ""} d&apos;essai.{" "}
          <Link href="/abonnement" className="underline">Voir l&apos;abonnement</Link>.
        </p>
      ) : null}

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

      <Section titre={`Vos concurrents (${concurrents.length})`}>
        <p className="mb-2 text-sm text-gray-600">
          Suivez les entreprises que vous croisez sur vos marchés : nous vous prévenons dès qu&apos;elles en gagnent un,
          et vous voyez lesquels de leurs marchés reviendront en jeu.
        </p>
        {concurrents.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Entreprise</th>
                <th className="py-2 pr-3 text-right">Gagnés en 12 mois</th>
                <th className="py-2 pr-3 text-right">À échéance sous 12 mois</th>
                <th className="py-2 pr-3">Dernier marché</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {concurrents.map((c) => (
                <tr key={c.siren} className="border-b align-top">
                  <td className="py-2 pr-3"><LienEntreprise siren={c.siren} nom={c.nom} /></td>
                  <td className="py-2 pr-3 text-right">{c.marches_12_mois}</td>
                  <td className="py-2 pr-3 text-right">
                    {c.echeances > 0 ? <Link href={`/entreprises/${c.siren}`} className="underline">{c.echeances}</Link> : 0}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{c.dernier_marche ? jour(c.dernier_marche) : "?"}</td>
                  <td className="py-2 text-right"><BoutonSuivi siren={c.siren} suivie petit /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {gains.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 font-medium">Ce qu&apos;ils ont gagné ces dernières semaines</h3>
            <p className="mb-2 text-xs text-gray-500">
              Les derniers marchés connus ; la fiche de chaque entreprise donne tout son historique.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Entreprise</th>
                  <th className="py-2 pr-3">Objet</th>
                  <th className="py-2 pr-3">Acheteur</th>
                  <th className="py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {gains.map((g) => (
                  <tr key={`${g.source}-${g.uid}-${g.siren}`} className="border-b align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{jour(g.date)}</td>
                    <td className="py-2 pr-3"><LienEntreprise siren={g.siren} nom={g.entreprise} /></td>
                    <td className="py-2 pr-3">
                      <span className="line-clamp-2" title={g.objet ?? undefined}>
                        {g.url
                          ? <a href={g.url} target="_blank" rel="noreferrer" className="underline decoration-gray-300 hover:decoration-gray-900">{g.objet ?? "Objet non publié"}</a>
                          : g.objet ?? "Objet non publié"}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {g.source === "avis" ? "Avis d'attribution" : "Données essentielles"}
                        {g.nb_lots > 1 && ` · ${g.nb_lots} lots`}
                      </span>
                    </td>
                    <td className="py-2 pr-3"><LienAcheteur siret={g.acheteur_siret} nom={g.acheteur_nom} /></td>
                    <td className="py-2 text-right whitespace-nowrap">{euros(g.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {suggestions.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 font-medium">Ils gagnent souvent les marchés de votre profil</h3>
            <ul className="divide-y text-sm">
              {suggestions.map((s) => (
                <li key={s.siren} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <LienEntreprise siren={s.siren} nom={s.nom} />
                    <span className="text-gray-600">
                      {" · "}{s.marches} marché{s.marches > 1 ? "s" : ""} chez {s.acheteurs} acheteur{s.acheteurs > 1 ? "s" : ""} en deux ans
                    </span>
                  </span>
                  <BoutonSuivi siren={s.siren} suivie={false} petit />
                </li>
              ))}
            </ul>
          </>
        )}

        <RechercheConcurrent />
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
