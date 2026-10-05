import { Formulaire } from "./formulaire";

export const metadata = { title: "Inscription" };

export default function PageInscription() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Votre veille en une minute</h1>
      <p className="mt-2 text-sm text-gray-700">
        Donnez votre SIRET : nous regardons ce que votre entreprise a déjà gagné comme marchés publics et
        ce qu&apos;elle vend, puis nous préparons votre veille. Vous pourrez tout corriger ensuite.
      </p>
      <Formulaire />
      <p className="mt-6 text-xs text-gray-500">
        Nous n&apos;utilisons votre adresse que pour vos alertes. Aucun paiement n&apos;est demandé à l&apos;inscription.
      </p>
    </main>
  );
}
