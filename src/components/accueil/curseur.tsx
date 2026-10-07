"use client";

/**
 * Curseur de la page d'accueil : un point qui suit la souris exactement et un halo qui le rattrape en
 * douceur. Le halo grossit sur les liens et les boutons, et pulse au clic. Souris seulement : rien sur
 * écran tactile, rien si le système limite les animations. Le curseur normal revient sur les champs.
 */
import { useEffect, useRef } from "react";

const CIBLES = "a, button, [data-curseur]";

export function Curseur() {
  const point = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const p = point.current;
    const h = halo.current;
    if (!p || !h) return;
    const racine = document.documentElement;
    racine.classList.add("curseur-perso");

    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let hx = x;
    let hy = y;
    let image = 0;

    const dessiner = () => {
      // le halo parcourt un cinquième du chemin à chaque image : il traîne un peu derrière le point
      hx += (x - hx) * 0.2;
      hy += (y - hy) * 0.2;
      p.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      h.style.transform = `translate3d(${hx}px, ${hy}px, 0)`;
      image = Math.abs(x - hx) + Math.abs(y - hy) > 0.2 ? requestAnimationFrame(dessiner) : 0;
    };
    const bouger = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      const cible = e.target instanceof Element ? e.target : null;
      const saisie = !!cible?.closest("input, textarea, select");
      racine.classList.toggle("curseur-cache", saisie);
      racine.classList.toggle("curseur-survol", !saisie && !!cible?.closest(CIBLES));
      racine.classList.add("curseur-visible");
      if (!image) image = requestAnimationFrame(dessiner);
    };
    const appuyer = () => {
      h.classList.remove("pulse");
      void h.offsetWidth; // relance l'animation même sur deux clics rapprochés
      h.classList.add("pulse");
    };
    const sortir = () => racine.classList.remove("curseur-visible");

    addEventListener("pointermove", bouger, { passive: true });
    addEventListener("pointerdown", appuyer);
    racine.addEventListener("mouseleave", sortir);
    return () => {
      removeEventListener("pointermove", bouger);
      removeEventListener("pointerdown", appuyer);
      racine.removeEventListener("mouseleave", sortir);
      cancelAnimationFrame(image);
      racine.classList.remove("curseur-perso", "curseur-visible", "curseur-survol", "curseur-cache");
    };
  }, []);

  return (
    <div aria-hidden="true" className="curseur">
      <div ref={halo} className="curseur-halo"><span /></div>
      <div ref={point} className="curseur-point"><span /></div>
    </div>
  );
}
