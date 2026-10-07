"use client";
import { useActionState } from "react";
import { BoutonEnvoi, ChampMotDePasse, Retour } from "@/components/formulaire";
import { actionNouveauMotDePasse, type EtatFormulaire } from "../actions";

export function FormulaireNouveau({ jeton }: { jeton: string }) {
  const [etat, envoyer, enCours] = useActionState<EtatFormulaire, FormData>(actionNouveauMotDePasse, {});
  return (
    <form action={envoyer}>
      <h1 className="text-[26px] leading-tight font-medium tracking-[-0.02em]">Nouveau mot de passe</h1>
      <p className="mt-1.5 text-sm text-[#a3a3b2]">Choisissez-le, puis nous vous connectons à votre veille.</p>
      <input type="hidden" name="jeton" value={jeton} />
      <div className="mt-2"><ChampMotDePasse nouveau etiquette="Nouveau mot de passe" /></div>
      <Retour erreur={etat.erreur} />
      <BoutonEnvoi enCours={enCours} attente="Enregistrement…">Enregistrer et me connecter</BoutonEnvoi>
    </form>
  );
}
