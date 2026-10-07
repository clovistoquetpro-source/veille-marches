"use client";

/** Un nombre qui défile jusqu'à sa valeur quand il entre dans l'écran. La page affiche déjà la vraie valeur sans JavaScript. */
import { useEffect, useRef, useState } from "react";
import { quandVisible } from "./mouvement";

const format = new Intl.NumberFormat("fr-FR");

export function Compteur({ valeur, duree = 1600 }: { valeur: number; duree?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [affiche, setAffiche] = useState(valeur);

  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let image = 0;
    // repart de zéro seulement s'il n'est pas encore à l'écran : on ne voit jamais le nombre redescendre
    const cadre = element.getBoundingClientRect();
    if (cadre.top < innerHeight && cadre.bottom > 0) return;
    setAffiche(0);
    const arreter = quandVisible(element, () => {
      const debut = performance.now();
      const pas = (maintenant: number) => {
        const t = Math.min(1, (maintenant - debut) / duree);
        setAffiche(Math.round(valeur * (1 - (1 - t) ** 4)));
        if (t < 1) image = requestAnimationFrame(pas);
      };
      image = requestAnimationFrame(pas);
    }, "0px");
    return () => {
      arreter();
      cancelAnimationFrame(image);
    };
  }, [valeur, duree]);

  return <span ref={ref} className="tabular-nums">{format.format(affiche)}</span>;
}
