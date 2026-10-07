"use client";

/**
 * L'accueil s'ouvre toujours en haut. Sans cela, le navigateur remet la page là où on l'avait quittée
 * (souvent sur l'arbre) quand on la recharge ou qu'on y revient, et une ancre restée dans l'adresse
 * (#reseau après « Voir comment ça marche ») y fait sauter aussi.
 */
import { useEffect } from "react";

/** À placer en haut de la page : s'exécute dès la lecture du HTML, avant que le navigateur replace la page. */
export const SCRIPT_OUVERTURE =
  'history.scrollRestoration="manual";if(location.hash)history.replaceState(history.state,"",location.pathname+location.search);';

export function OuvertureEnHaut() {
  useEffect(() => {
    const avant = history.scrollRestoration;
    history.scrollRestoration = "manual";
    if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
    scrollTo({ top: 0, behavior: "instant" });

    // les liens vers une section de la page y descendent sans laisser d'ancre dans l'adresse ; écouté
    // avant les liens de Next (phase de capture), qui sinon ajoutent l'ancre eux-mêmes
    const clic = (evenement: MouseEvent) => {
      if (evenement.defaultPrevented || evenement.button !== 0 || evenement.metaKey || evenement.ctrlKey) return;
      const lien = (evenement.target as Element | null)?.closest?.('a[href^="#"]');
      const cible = lien && document.getElementById(lien.getAttribute("href")!.slice(1));
      if (!cible) return;
      evenement.preventDefault();
      cible.scrollIntoView();
    };
    document.addEventListener("click", clic, true);
    return () => {
      history.scrollRestoration = avant;
      document.removeEventListener("click", clic, true);
    };
  }, []);
  return null;
}
