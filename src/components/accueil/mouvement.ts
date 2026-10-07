"use client";

/** Outils partagés par les animations de la page d'accueil. */
import { useEffect, useState } from "react";

/** Vrai quand le système demande de limiter les animations : la page montre alors tout, sans mouvement. */
export function useMoinsDAnimations(): boolean {
  const [reduit, setReduit] = useState(false);
  useEffect(() => {
    const requete = matchMedia("(prefers-reduced-motion: reduce)");
    const lire = () => setReduit(requete.matches);
    lire();
    requete.addEventListener("change", lire);
    return () => requete.removeEventListener("change", lire);
  }, []);
  return reduit;
}

/**
 * Avancement du défilement dans une section plus haute que l'écran, dont le contenu reste collé :
 * 0 quand son haut atteint le haut de l'écran, 1 quand son bas atteint le bas. Un calcul par image au plus.
 */
export function suivreDefilement(section: HTMLElement, suivre: (avancement: number) => void): () => void {
  let image = 0;
  const calculer = () => {
    image = 0;
    const cadre = section.getBoundingClientRect();
    const course = cadre.height - innerHeight;
    suivre(course > 0 ? Math.min(1, Math.max(0, -cadre.top / course)) : cadre.top < 0 ? 1 : 0);
  };
  const demander = () => {
    if (!image) image = requestAnimationFrame(calculer);
  };
  calculer();
  addEventListener("scroll", demander, { passive: true });
  addEventListener("resize", demander);
  return () => {
    removeEventListener("scroll", demander);
    removeEventListener("resize", demander);
    cancelAnimationFrame(image);
  };
}

/** Appelle `entrer` la première fois que l'élément devient visible. */
export function quandVisible(element: Element, entrer: () => void, marge = "0px 0px -15% 0px"): () => void {
  const observateur = new IntersectionObserver(
    (entrees) => {
      if (entrees.some((e) => e.isIntersecting)) {
        observateur.disconnect();
        entrer();
      }
    },
    { rootMargin: marge },
  );
  observateur.observe(element);
  return () => observateur.disconnect();
}
