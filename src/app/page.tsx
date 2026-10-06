import Link from "next/link";

export default function Accueil() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">Le radar des marchés publics</h1>
      <p className="mt-3 text-gray-700">
        Ce qui sort aujourd&apos;hui, et ce qui sortira dans un an. Site en construction.
      </p>
      <p className="mt-6">
        <Link href="/renouvellements" className="underline">
          Voir les marchés qui arrivent à échéance
        </Link>
      </p>
    </main>
  );
}
