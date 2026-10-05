import { EDITEUR, EDITEUR_A_COMPLETER, JOURS_ESSAI, NOM, PRIX_MENSUEL } from "@/lib/produit";

export const metadata = { title: "Conditions d'utilisation et de vente" };

export default function PageConditions() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Conditions d&apos;utilisation et de vente</h1>

      {EDITEUR_A_COMPLETER && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Identité de l&apos;éditeur à renseigner avant la mise en ligne, et conditions à faire relire avant
          d&apos;encaisser le premier paiement.
        </p>
      )}

      <h2 className="mt-6 text-lg font-semibold">Objet</h2>
      <p className="mt-2 text-sm text-gray-700">
        {NOM}, édité par {EDITEUR.raison_sociale}, est un service de veille sur les marchés publics français. Il
        rassemble des données publiques et prévient ses clients des avis et des marchés qui les concernent.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Compte et abonnement</h2>
      <p className="mt-2 text-sm text-gray-700">
        Le service s&apos;adresse aux professionnels. L&apos;inscription demande une adresse électronique et un
        SIRET. L&apos;essai dure {JOURS_ESSAI} jours, sans carte bancaire. Au-delà, l&apos;abonnement coûte{" "}
        {PRIX_MENSUEL} € par mois hors taxes, prélevé chaque mois par Stripe, sans engagement de durée. Le client
        résilie quand il veut depuis sa page d&apos;abonnement ; le service reste ouvert jusqu&apos;à la fin de la
        période déjà payée, qui n&apos;est pas remboursée au prorata.
      </p>
      <p className="mt-2 text-sm text-gray-700">
        S&apos;agissant d&apos;un contrat conclu entre professionnels, le droit de rétractation de quatorze jours
        prévu pour les consommateurs ne s&apos;applique pas ; l&apos;essai gratuit en tient lieu.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Ce que le service garantit, et ce qu&apos;il ne garantit pas</h2>
      <p className="mt-2 text-sm text-gray-700">
        Les informations proviennent de sources publiques officielles et sont reprises telles qu&apos;elles sont
        publiées. Les dates de fin de marché sont des <strong>estimations</strong>, calculées à partir de la durée
        annoncée : un acheteur peut relancer plus tôt, plus tard, ou pas du tout. Les montants sont ceux déclarés par
        les acheteurs et comportent des erreurs de saisie. {NOM} ne garantit donc ni l&apos;exactitude ni
        l&apos;exhaustivité des données, et ne saurait être tenu responsable d&apos;une décision commerciale prise
        sur leur seule foi. Le client reste tenu de consulter l&apos;avis officiel avant de répondre à un marché.
      </p>
      <p className="mt-2 text-sm text-gray-700">
        Le service est fourni sans garantie de disponibilité ininterrompue. En cas d&apos;interruption prolongée qui
        nous est imputable, le mois concerné est remboursé au prorata, ce qui constitue la réparation due.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Usage</h2>
      <p className="mt-2 text-sm text-gray-700">
        Le compte est personnel à l&apos;entreprise abonnée. L&apos;extraction massive et la revente des données du
        service sont interdites, comme toute tentative d&apos;en perturber le fonctionnement. Les données publiques
        restent, elles, librement réutilisables auprès de leurs sources sous Licence Ouverte 2.0.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Droit applicable</h2>
      <p className="mt-2 text-sm text-gray-700">
        Ces conditions sont soumises au droit français. En cas de litige, les parties cherchent une solution amiable
        avant toute action ; à défaut, les tribunaux français sont compétents.
      </p>
    </main>
  );
}
