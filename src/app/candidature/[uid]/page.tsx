import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Section } from "@/components/fiche";
import { LienAcheteur } from "@/components/liens";
import { abonnementDuCompte, accesOuvert } from "@/lib/abonnements";
import { analysesDeLAvis, analysesRestantes, FICHIERS_MAX, TAILLE_MAX_FICHIER, VERDICTS } from "@/lib/analyse";
import { avisPourCandidature, candidatDuCompte, PAGE_OFFICIELLE, referenceAvis } from "@/lib/candidature";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { db } from "@/lib/db";
import { euros, jour } from "@/lib/format";
import { ANALYSES_PAR_MOIS } from "@/lib/produit";
import { AnalyseDossier } from "./analyse-dossier";

export const dynamic = "force-dynamic";
export const metadata = { title: "Préparer ma candidature" };

type Props = { params: Promise<{ uid: string }> };

function Ligne({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  return (
    <div className="grid grid-cols-[14rem_1fr] gap-3 border-b py-1.5 text-sm">
      <dt className="text-gray-600">{libelle}</dt>
      <dd className={valeur ? "whitespace-pre-line" : "text-gray-400"}>{valeur ?? "à compléter dans le fichier"}</dd>
    </div>
  );
}

export default async function PageCandidature({ params }: Props) {
  const { uid } = await params;
  const sql = db();
  if (!sql) return <p className="p-8">Base de données non configurée (variable DATABASE_URL).</p>;
  const session = (await cookies()).get(COOKIE_SESSION)?.value;
  const donnees = await (async () => {
    const compte = await compteDeLaSession(sql, session);
    if (!compte) return "connexion" as const;
    const avis = await avisPourCandidature(sql, uid);
    if (!avis) return null;
    const [candidat, abonnement, restantes, analyses] = await Promise.all([
      candidatDuCompte(sql, compte), abonnementDuCompte(sql, compte.id),
      analysesRestantes(sql, compte.id), analysesDeLAvis(sql, compte.id, avis.uid),
    ]);
    return { compte, avis, candidat, acces: accesOuvert(abonnement), restantes, analyses };
  })().finally(() => sql.end());
  if (donnees === "connexion") redirect("/connexion");
  if (!donnees) notFound();
  const { avis, candidat, acces, restantes, analyses } = donnees;
  const iaActivee = Boolean(process.env.ANTHROPIC_API_KEY);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const depasse = avis.date_limite !== null && avis.date_limite < aujourdhui;
  const adresse = [candidat.adresse, candidat.adresse_siege && `Siège social : ${candidat.adresse_siege}`].filter(Boolean).join("\n");
  const ca = candidat.chiffres_affaires.slice(0, 3).map((e) => `${e.annee} : ${euros(e.ca)}`).join(" · ");

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="text-sm text-gray-600"><Link href="/veille" className="underline">Ma veille</Link> › Préparer ma candidature</p>
      <h1 className="mt-1 text-2xl font-semibold">{avis.objet}</h1>
      <p className="mt-1 text-sm text-gray-600">
        <LienAcheteur siret={avis.acheteur_siret} nom={avis.acheteur_nom} />
        {" · "}{referenceAvis(avis)}
        {avis.date_limite && <> · réponse avant le {jour(avis.date_limite)}</>}
        {" · "}<a href={avis.url} target="_blank" rel="noreferrer" className="underline">voir l&apos;avis</a>
      </p>
      {depasse && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          La date limite de réponse est passée : vérifiez sur l&apos;avis que la consultation est encore ouverte.
        </p>
      )}
      {avis.type !== "marche" && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Cet avis n&apos;est pas un appel d&apos;offres ouvert : les formulaires ne vous serviront que si une consultation est en cours.
        </p>
      )}

      <Section titre="Vos formulaires DC1 et DC2, déjà remplis">
        <p className="text-sm text-gray-700">
          Nous remplissons la lettre de candidature (DC1) et la déclaration du candidat (DC2) avec l&apos;avis et les
          informations publiques de votre entreprise. Vous recevez des fichiers Word : relisez-les, complétez ce qui manque
          et cochez vous-même les déclarations sur l&apos;honneur.
        </p>

        <form action={`/candidature/${encodeURIComponent(avis.uid)}/telecharger`} method="get" className="mt-4 space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-gray-600">Téléphone à indiquer</span>
              <input name="telephone" type="tel" placeholder="04 72 00 00 00" className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-gray-600">Adresse électronique à indiquer</span>
              <input name="email" type="email" defaultValue={candidat.email ?? ""} className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          <fieldset>
            <legend className="text-gray-600">Vous répondez :</legend>
            <label className="mt-1 flex items-center gap-2"><input type="radio" name="lots" value="sans_lots" defaultChecked /> au marché (il n&apos;est pas découpé en lots)</label>
            <label className="mt-1 flex items-center gap-2"><input type="radio" name="lots" value="tous" /> à tous les lots</label>
            <label className="mt-1 flex flex-wrap items-center gap-2">
              <input type="radio" name="lots" value="certains" /> à certains lots :
              <input name="numeros" placeholder="1 et 3" className="w-40 rounded border px-2 py-1" />
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button name="formulaire" value="dc1" className="rounded bg-gray-900 px-4 py-2 text-white">Télécharger le DC1 (Word)</button>
            <button name="formulaire" value="dc2" className="rounded bg-gray-900 px-4 py-2 text-white">Télécharger le DC2 (Word)</button>
          </div>
          <p className="text-xs text-gray-500">
            Ces fichiers supposent une candidature seule, sans groupement. Formulaires non obligatoires : certains acheteurs
            demandent le DUME ou leurs propres modèles, lisez le règlement de la consultation.{" "}
            <a href={PAGE_OFFICIELLE} target="_blank" rel="noreferrer" className="underline">Modèles officiels et notices</a>.
          </p>
        </form>
      </Section>

      <Section titre="Faut-il y aller ? L'avis de l'IA sur le dossier">
        <p className="text-sm text-gray-700">
          Déposez le dossier de consultation téléchargé sur le site de l&apos;acheteur. L&apos;IA le lit avec ce que nous savons
          de votre entreprise et vous dit si ça vaut le coup : conditions éliminatoires, pièces à fournir, critères de choix,
          dates à ne pas manquer.
        </p>
        <div className="mt-4">
          {!iaActivee ? (
            <p className="text-sm text-gray-500">L&apos;analyse des dossiers sera bientôt disponible.</p>
          ) : !acces ? (
            <p className="text-sm text-amber-900">
              Votre essai est terminé. <Link href="/abonnement" className="underline">Reprenez l&apos;abonnement</Link> pour analyser un dossier.
            </p>
          ) : restantes === 0 ? (
            <p className="text-sm text-gray-700">
              Vous avez utilisé vos {ANALYSES_PAR_MOIS} analyses de ce mois-ci. Le compteur repart à zéro le 1er du mois.
            </p>
          ) : (
            <>
              <AnalyseDossier uid={avis.uid} tailleMax={TAILLE_MAX_FICHIER} fichiersMax={FICHIERS_MAX} />
              <p className="mt-2 text-xs text-gray-500">
                Il vous reste {restantes} analyse{restantes > 1 ? "s" : ""} sur {ANALYSES_PAR_MOIS} ce mois-ci. Vos fichiers sont
                effacés dès la fin de l&apos;analyse. L&apos;IA peut se tromper : vérifiez dans le dossier avant de décider.
              </p>
            </>
          )}
        </div>
        {analyses.length > 0 && (
          <ul className="mt-4 divide-y border-t text-sm">
            {analyses.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/analyses/${a.id}`} className="underline">Analyse du {jour(a.cree_le)}</Link>
                <span className={`rounded border px-2 py-0.5 text-xs ${VERDICTS[a.resultat.verdict].couleur}`}>
                  {VERDICTS[a.resultat.verdict].titre}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section titre="Ce que nous mettons dans vos formulaires">
        {candidat.origine !== "annuaire" && (
          <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            L&apos;annuaire public des entreprises ne répond pas pour le moment : votre adresse et vos chiffres d&apos;affaires
            manquent. Réessayez dans quelques minutes, ou complétez-les dans le fichier.
          </p>
        )}
        <dl>
          <Ligne libelle="Dénomination" valeur={[candidat.enseigne, candidat.denomination].filter(Boolean).join(" – ") || null} />
          <Ligne libelle="Adresse" valeur={adresse || null} />
          <Ligne libelle="SIRET" valeur={candidat.siret} />
          <Ligne libelle="Forme juridique" valeur={candidat.forme_juridique} />
          <Ligne libelle="PME" valeur={candidat.pme === null ? null : candidat.pme ? "Oui" : "Non"} />
          <Ligne libelle="Activité (NAF)" valeur={candidat.naf && [candidat.naf, candidat.naf_libelle].filter(Boolean).join(" – ")} />
          <Ligne libelle="Effectif" valeur={candidat.effectif} />
          <Ligne libelle="Chiffres d'affaires" valeur={ca || null} />
          <Ligne libelle="Création" valeur={candidat.date_creation ? jour(candidat.date_creation) : null} />
        </dl>
        <p className="mt-2 text-xs text-gray-500">
          Sources : avis {avis.source === "ted" ? "TED" : "BOAMP"}, annuaire des entreprises (Insee, INPI). Une erreur ? Elle
          vient du registre public : corrigez-la dans le fichier.
        </p>
      </Section>
    </main>
  );
}
