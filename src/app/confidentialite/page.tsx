import Link from "next/link";
import { EDITEUR, HEBERGEURS, NOM } from "@/lib/produit";

export const metadata = { title: "Données personnelles" };

export default function PageConfidentialite() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Données personnelles</h1>
      <p className="mt-3 text-sm text-gray-700">
        {NOM} traite le minimum de données nécessaire à la veille. Cette page dit lesquelles, pourquoi, et
        combien de temps.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Ce que nous gardons</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
        <li><strong>Votre adresse électronique</strong>, pour vous envoyer vos alertes et vous identifier.</li>
        <li><strong>Le SIRET de votre entreprise</strong>, pour en déduire votre profil de veille.</li>
        <li><strong>Votre profil de veille</strong> : codes CPV, mots-clés, départements, rythme des alertes.</li>
        <li><strong>Les entreprises que vous suivez</strong>, pour vous prévenir des marchés qu&apos;elles gagnent.</li>
        <li><strong>Ce qui vous a déjà été annoncé</strong>, pour ne jamais vous écrire deux fois la même chose.</li>
        <li>
          <strong>Votre abonnement</strong> : son état et les identifiants que Stripe nous renvoie. Nous ne voyons
          jamais votre numéro de carte, qui reste chez Stripe.
        </li>
      </ul>
      <p className="mt-3 text-sm text-gray-700">
        Nous ne faisons pas de publicité, nous ne revendons aucune donnée et nous n&apos;utilisons pas de traceur
        publicitaire. Le seul témoin déposé est celui de votre session, indispensable pour rester connecté.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Combien de temps</h2>
      <p className="mt-2 text-sm text-gray-700">
        Tant que votre compte existe, puis douze mois après sa fermeture pour les obligations comptables. Les
        données publiques des marchés, elles, ne vous concernent pas personnellement et restent en base.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Où</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
        {HEBERGEURS.map((h) => <li key={h.nom}>{h.nom} — {h.adresse}</li>)}
      </ul>
      <p className="mt-2 text-sm text-gray-700">
        L&apos;intelligence artificielle qui devine votre profil reçoit le nom et l&apos;activité déclarée de votre
        entreprise, jamais votre adresse électronique.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Vos droits</h2>
      <p className="mt-2 text-sm text-gray-700">
        Vous pouvez accéder à vos données, les corriger, les faire effacer ou les emporter, et vous opposer à leur
        traitement. Écrivez à <a href={`mailto:${EDITEUR.contact}`} className="underline">{EDITEUR.contact}</a> :
        nous répondons sous un mois. Vous pouvez aussi saisir la CNIL. Pour arrêter seulement les courriels, le lien
        de désinscription en bas de chaque alerte suffit, ou le réglage dans{" "}
        <Link href="/veille" className="underline">votre veille</Link>.
      </p>
    </main>
  );
}
