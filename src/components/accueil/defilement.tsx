"use client";

/** Sections animées par le défilement, et blocs qui apparaissent quand on arrive dessus. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { quandVisible, suivreDefilement } from "./mouvement";

/**
 * Section haute dont le contenu reste collé à l'écran pendant qu'on fait défiler. Elle écrit son
 * avancement (0 à 1) dans la variable CSS --p : les styles s'en servent pour animer le contenu.
 */
export function SectionCollante({ id, hauteur, className = "", interieur = "", children }: {
  id?: string;
  hauteur: string;
  className?: string;
  interieur?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    return suivreDefilement(section, (p) => {
      section.style.setProperty("--p", p.toFixed(4));
      // au-delà de la moitié, les boutons du début sont effacés : on ne doit plus pouvoir les cliquer
      section.toggleAttribute("data-loin", p > 0.42);
    });
  }, []);
  return (
    <section id={id} ref={ref} className={`relative ${className}`} style={{ height: hauteur, "--p": 0 } as CSSProperties}>
      <div className={`sticky top-0 h-svh overflow-hidden ${interieur}`}>{children}</div>
    </section>
  );
}

/** Le bloc glisse et se précise en entrant dans l'écran. `delai` en millisecondes. */
export function Apparait({ children, className = "", delai = 0 }: { children: React.ReactNode; className?: string; delai?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vu, setVu] = useState(false);
  useEffect(() => (ref.current ? quandVisible(ref.current, () => setVu(true)) : undefined), []);
  return (
    <div ref={ref} className={`entree ${vu ? "vue" : ""} ${className}`} style={delai ? { transitionDelay: `${delai}ms` } : undefined}>
      {children}
    </div>
  );
}
