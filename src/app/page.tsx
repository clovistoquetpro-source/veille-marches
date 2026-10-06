import Link from "next/link";
import { BASELINE, JOURS_ESSAI, NOM, PRIX_MENSUEL } from "@/lib/produit";

export const metadata = {
  description:
    "Les nouveaux appels d'offres publics chaque matin, et les marchés qui seront relancés dans 6 à 12 mois. " +
    "Inscription avec votre seul SIRET.",
};

const ATOUTS = [
  {
    titre: "Les renouvellements avant tout le monde",
    texte: "Un marché de nettoyage, de maintenance ou d'informatique se termine dans neuf mois ? Vous le savez " +
      "maintenant : l'acheteur, le titulaire actuel, le montant et la date probable de relance.",
  },
  {
    titre: "Aucun réglage",
    texte: "Entrez votre SIRET. Nous lisons votre activité et les marchés que vous avez déjà gagnés, et nous " +
      "réglons votre veille tout seuls. Pas de mots-clés ni de codes CPV à deviner.",
  },
  {
    titre: "La fiche de chaque acheteur",
    texte: "Ce que la mairie, l'hôpital ou la région achète, à qui, à quel prix et à quel rythme. Vous prospectez " +
      "les acheteurs publics comme vos meilleurs clients.",
  },
  {
    titre: "Vos concurrents à la loupe",
    texte: "Qui gagne quoi, pour quel montant, et quand ce marché reviendra en jeu. Suivez vos concurrents : " +
      "vous êtes prévenu dès qu'ils remportent un marché.",
  },
];

const QUESTIONS = [
  {
    question: "D'où viennent les données ?",
    reponse: "Des sources publiques officielles : le BOAMP, le Journal officiel de l'Union européenne (TED) et les " +
      "données essentielles de la commande publique publiées par l'État.",
  },
  {
    question: "Pour quels métiers ?",
    reponse: "Tous : travaux, services, fournitures, informatique, conseil. La veille s'adapte à votre activité à " +
      "partir de votre SIRET.",
  },
  {
    question: "Mes données sont-elles protégées ?",
    reponse: "Nous n'utilisons votre SIRET que pour régler vos alertes, et votre adresse que pour vous les envoyer. " +
      "Les données sont hébergées dans l'Union européenne.",
  },
];

export default function Accueil() {
  return (
    <main>
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">{BASELINE}</h1>
        <p className="mt-4 text-lg text-gray-700">
          {NOM} vous alerte sur les nouveaux appels d&apos;offres, mais aussi 6 à 12 mois avant qu&apos;un marché
          soit relancé. Vous avez le temps de rencontrer l&apos;acheteur et de préparer une offre qui gagne.
        </p>
        <p className="mt-6">
          <Link href="/inscription" className="inline-block rounded bg-gray-900 px-5 py-3 text-white">
            Voir les marchés qui me concernent
          </Link>
        </p>
        <p className="mt-2 text-sm text-gray-600">
          {JOURS_ESSAI} jours d&apos;essai gratuit. Inscription avec votre seul numéro SIRET.
        </p>
      </section>

      <section className="border-y bg-gray-50">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="text-xl font-semibold">Quand l&apos;appel d&apos;offres paraît, il est déjà tard</h2>
          <p className="mt-3 text-gray-700">
            Il reste souvent trente jours pour répondre. Le titulaire sortant, lui, s&apos;y prépare depuis des mois.
            Chaque marché attribué a une date de fin : c&apos;est public, mais personne ne vous le met sous les yeux.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-xl font-semibold">Ce que vous recevez</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {ATOUTS.map((a) => (
            <div key={a.titre}>
              <h3 className="font-medium">{a.titre}</h3>
              <p className="mt-1 text-sm text-gray-700">{a.texte}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-gray-700">
          Et bien sûr, les nouveaux appels d&apos;offres du BOAMP et des avis européens chaque matin, triés pour vous.
          Vous pouvez aussi tout parcourir sans compte : <Link href="/avis" className="underline">les avis publiés</Link>{" "}
          et <Link href="/renouvellements" className="underline">les marchés qui arrivent à échéance</Link>.
        </p>
      </section>

      <section className="border-y bg-gray-50">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="text-xl font-semibold">Tarif fondateur</h2>
          <p className="mt-3 text-gray-700">
            <strong>{PRIX_MENSUEL} € par mois hors taxes</strong>, sans engagement, pour les premières entreprises
            inscrites. Les {JOURS_ESSAI} premiers jours sont gratuits et sans carte bancaire.
          </p>
          <p className="mt-4">
            <Link href="/inscription" className="inline-block rounded bg-gray-900 px-5 py-3 text-white">
              Commencer avec mon SIRET
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-xl font-semibold">Questions fréquentes</h2>
        <dl className="mt-4 space-y-4">
          {QUESTIONS.map((q) => (
            <div key={q.question}>
              <dt className="font-medium">{q.question}</dt>
              <dd className="mt-1 text-sm text-gray-700">{q.reponse}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
