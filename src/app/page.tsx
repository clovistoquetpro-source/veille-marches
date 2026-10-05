import Link from "next/link";

export default function Accueil() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">Le radar des marchés publics</h1>
      <p className="mt-3 text-gray-700">
        Ce qui sort aujourd&apos;hui, et ce qui sortira dans un an.
      </p>
      <p className="mt-4">
        <Link href="/inscription" className="inline-block rounded bg-gray-900 px-4 py-2 text-white">
          Voir les marchés qui me concernent
        </Link>
        <span className="ml-3 text-sm text-gray-600">Il suffit de votre SIRET.</span>
      </p>
      <ul className="mt-6 list-disc space-y-2 pl-5">
        <li>
          <Link href="/avis" className="underline">Les appels d&apos;offres publiés</Link> (BOAMP et TED, chaque matin)
        </li>
        <li>
          <Link href="/renouvellements" className="underline">Les marchés qui arrivent à échéance</Link> dans les 12 mois
        </li>
      </ul>
    </main>
  );
}
