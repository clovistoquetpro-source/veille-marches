import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { abonnementDuCompte, accesOuvert, joursDEssai } from "@/lib/abonnements";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { MAX_CONCURRENTS } from "@/lib/concurrents";
import { db } from "@/lib/db";
import { JOURS_ESSAI, NOM, PRIX_MENSUEL } from "@/lib/produit";
import { paiementConfigure } from "@/lib/stripe";
import { BoutonPaiement } from "./bouton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abonnement" };

type Props = { searchParams: Promise<{ paye?: string }> };

export default async function PageAbonnement({ searchParams }: Props) {
  const { paye } = await searchParams;
  const sql = db();
  if (!sql) return <p className="p-8">Base de données non configurée (variable DATABASE_URL).</p>;
  const donnees = await (async () => {
    const compte = await compteDeLaSession(sql, (await cookies()).get(COOKIE_SESSION)?.value);
    if (!compte) return null;
    return { compte, abonnement: await abonnementDuCompte(sql, compte.id) };
  })().finally(() => sql.end());
  if (!donnees) redirect("/inscription");
  const { compte, abonnement } = donnees;
  const jours = joursDEssai(abonnement);

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Votre abonnement</h1>

      {paye === "oui" && (
        <p className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          Merci, votre paiement est enregistré. Il faut parfois une minute pour que Stripe nous le confirme.
        </p>
      )}

      <p className="mt-4 text-sm text-gray-700">
        {abonnement?.statut === "actif" && "Votre abonnement est en cours."}
        {abonnement?.statut === "en_retard" && "Votre dernier paiement n'est pas passé. Mettez votre carte à jour pour ne pas perdre vos alertes."}
        {abonnement?.statut === "resilie" && "Votre abonnement est résilié. Vous pouvez reprendre quand vous voulez."}
        {abonnement?.statut === "essai" && jours !== null && (jours > 0
          ? `Il vous reste ${jours} jour${jours > 1 ? "s" : ""} d'essai gratuit.`
          : "Votre essai gratuit est terminé.")}
        {!abonnement && `Votre essai gratuit dure ${JOURS_ESSAI} jours.`}
      </p>

      <section className="mt-6 rounded border p-4">
        <p className="text-sm text-gray-600">Tarif fondateur</p>
        <p className="mt-1 text-3xl font-semibold">{PRIX_MENSUEL} € <span className="text-base font-normal text-gray-600">par mois HT</span></p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>Les appels d&apos;offres qui vous concernent, chaque matin.</li>
          <li>Les marchés de votre secteur qui seront relancés dans 6 à 12 mois.</li>
          <li>Les fiches des acheteurs et de vos concurrents, sans limite.</li>
          <li>Le suivi de {MAX_CONCURRENTS} concurrents : une alerte dès qu&apos;ils gagnent un marché.</li>
          <li>Sans engagement : vous arrêtez quand vous voulez.</li>
        </ul>
        {paiementConfigure() ? (
          <BoutonPaiement actif={abonnement?.statut === "actif"} />
        ) : (
          <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Le paiement n&apos;est pas encore ouvert sur cette installation de {NOM}. Vous gardez l&apos;accès pendant votre essai.
          </p>
        )}
      </section>

      <p className="mt-6 text-sm">
        <Link href="/veille" className="underline">Retour à ma veille</Link>
        <span className="text-gray-500"> · {compte.email}</span>
      </p>
      <p className="mt-2 text-xs text-gray-500">
        {accesOuvert(abonnement)
          ? "Votre accès est ouvert."
          : "Votre accès est suspendu : les alertes ne partent plus tant que l'abonnement n'est pas repris."}
      </p>
    </main>
  );
}
