import { EDITEUR, EDITEUR_A_COMPLETER, HEBERGEURS, NOM } from "@/lib/produit";

export const metadata = { title: "Mentions légales" };

export default function PageMentions() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Mentions légales</h1>

      {EDITEUR_A_COMPLETER && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Identité de l&apos;éditeur à renseigner avant la mise en ligne (variables d&apos;environnement
          <code className="mx-1">EDITEUR_*</code>).
        </p>
      )}

      <h2 className="mt-6 text-lg font-semibold">Éditeur</h2>
      <p className="mt-2 text-sm text-gray-700">
        {NOM} est édité par {EDITEUR.raison_sociale} ({EDITEUR.forme}), SIREN {EDITEUR.siren},
        dont le siège est situé {EDITEUR.adresse}.
        {EDITEUR.tva && ` Numéro de TVA intracommunautaire : ${EDITEUR.tva}.`}
        <br />Directeur de la publication : {EDITEUR.directeur}.
        <br />Contact : <a href={`mailto:${EDITEUR.contact}`} className="underline">{EDITEUR.contact}</a>.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Hébergement</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
        {HEBERGEURS.map((h) => (
          <li key={h.nom}>{h.nom} — {h.adresse}</li>
        ))}
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Données publiques</h2>
      <p className="mt-2 text-sm text-gray-700">
        Les marchés, les avis et les entreprises présentés proviennent de données publiques diffusées sous Licence
        Ouverte 2.0 : données essentielles de la commande publique (ministère de l&apos;Économie), BOAMP (DILA),
        TED (Office des publications de l&apos;Union européenne) et base Sirene (Insee). Les montants et les dates
        sont repris tels que publiés par les acheteurs ; les dates de fin sont estimées à partir de la durée publiée.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Correction d&apos;une information</h2>
      <p className="mt-2 text-sm text-gray-700">
        Une entreprise ou un acheteur qui constate une erreur peut nous écrire : nous corrigeons ou retirons
        l&apos;information, et nous la signalons à la source lorsqu&apos;elle vient d&apos;elle.
      </p>
    </main>
  );
}
