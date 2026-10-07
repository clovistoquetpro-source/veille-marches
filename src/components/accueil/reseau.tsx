"use client";

/**
 * « Votre entreprise » qui pousse : un arbre dessiné sur un canevas, dont chaque branche mène à des
 * marchés. Il grandit pendant le défilement, ses branches ondulent et s'écartent du curseur. Une fois
 * l'arbre complet, des signaux descendent des marchés jusqu'à votre entreprise : ce sont les alertes.
 * Si le système limite les animations, l'arbre est dessiné complet, immobile.
 */
import { useEffect, useRef, useState } from "react";
import { suivreDefilement, useMoinsDAnimations } from "./mouvement";

type Rgb = [number, number, number];

/** Les quatre grandes branches, de gauche à droite. Les exemples sont fictifs. */
export const FAMILLES: { nom: string; couleur: Rgb; exemples: [string, string] }[] = [
  { nom: "Appels d'offres du jour", couleur: [139, 155, 255], exemples: ["Nettoyage de locaux · 84 k€", "Maintenance informatique · 210 k€"] },
  { nom: "Marchés qui reviennent", couleur: [190, 160, 255], exemples: ["Revient dans 8 mois · une mairie", "Revient dans 11 mois · un hôpital"] },
  { nom: "Acheteurs à rencontrer", couleur: [110, 205, 255], exemples: ["Une région · 14 achats par an", "Un lycée · rachète tous les 3 ans"] },
  { nom: "Concurrents à suivre", couleur: [255, 170, 205], exemples: ["Un concurrent gagne · 120 k€", "Nouveau titulaire · un département"] },
];

const ETAPES = [
  { titre: "Tout part de votre SIRET.", texte: "Une seule information à donner. Pas de mots-clés à deviner, pas de codes CPV." },
  { titre: "Nous lisons votre entreprise.", texte: "Son activité, les marchés qu'elle a déjà gagnés, les acheteurs qui l'ont déjà choisie." },
  {
    titre: "Elle se relie aux marchés qui lui ressemblent.",
    texte: "Les appels d'offres du jour, les marchés qui vont revenir, les acheteurs à rencontrer, les concurrents à suivre.",
  },
  {
    titre: "Et chaque matin, les offres viennent à vous.",
    texte: "Plus de 11 000 avis paraissent chaque mois. Seuls ceux qui vous concernent arrivent dans votre boîte mail.",
  },
];
/** Avancement du défilement auquel chaque étape commence. */
const SEUILS = [0, 0.2, 0.46, 0.8];
/** L'arbre pousse entre ces deux moments du défilement. */
const POUSSE_DEBUT = 0.12;
const POUSSE_FIN = 0.78;

const PROFONDEUR = 5;
/** Distance (px) en deçà de laquelle une branche s'écarte du curseur. */
const RAYON = 150;
const TRONC: Rgb = [200, 208, 255];

type Branche = {
  parent: number;
  enfants: number[];
  /** Angle par rapport à la branche parente, en radians. */
  angle: number;
  /** Longueur, en fraction de la taille de l'arbre. */
  longueur: number;
  profondeur: number;
  famille: number;
  /** Moments où la branche commence et finit de pousser, entre 0 et 1. */
  debut: number;
  fin: number;
  phase: number;
  courbure: number;
};

/** Suite pseudo-aléatoire fixe : l'arbre a la même forme à chaque visite. */
function hasard(graine: number): () => number {
  return () => {
    graine = (graine + 0x6d2b79f5) | 0;
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function construireArbre(): Branche[] {
  const h = hasard(11);
  const arbre: Branche[] = [];
  const ajouter = (b: Omit<Branche, "enfants">) => {
    arbre.push({ ...b, enfants: [] });
    const i = arbre.length - 1;
    if (b.parent >= 0) arbre[b.parent].enfants.push(i);
    return i;
  };
  const pousser = (parent: number, profondeur: number, famille: number, angle: number, absolu: number, longueur: number, debut: number) => {
    const duree = 0.13 + h() * 0.05;
    const i = ajouter({ parent, angle, longueur, profondeur, famille, debut, fin: debut + duree, phase: h() * Math.PI * 2, courbure: (h() - 0.5) * 0.5 });
    if (profondeur >= PROFONDEUR) return;
    const n = profondeur >= 2 && h() < 0.18 ? 3 : 2;
    const ecart = (0.3 + h() * 0.16) * (n === 3 ? 0.85 : 1);
    for (let k = 0; k < n; k++) {
      // les rameaux se redressent un peu vers le ciel, comme un vrai arbre
      const relatif = (k - (n - 1) / 2) * ecart + (h() - 0.5) * 0.12 - (absolu + Math.PI / 2) * 0.12;
      pousser(i, profondeur + 1, famille, relatif, absolu + relatif, longueur * (0.7 + h() * 0.1), debut + duree * 0.85 + h() * 0.03);
    }
  };
  const tronc = ajouter({ parent: -1, angle: -Math.PI / 2, longueur: 0.2, profondeur: 0, famille: -1, debut: 0, fin: 0.16, phase: 0, courbure: 0.04 });
  [-0.78, -0.26, 0.26, 0.78].forEach((a, f) => {
    const angle = a + (h() - 0.5) * 0.1;
    pousser(tronc, 1, f, angle, -Math.PI / 2 + angle, 0.17, 0.15 + h() * 0.03);
  });
  // ramène la dernière feuille à 0,9 : l'arbre est complet un peu avant la fin de la pousse
  const derniere = Math.max(...arbre.map((b) => b.fin));
  for (const b of arbre) {
    b.debut *= 0.9 / derniere;
    b.fin *= 0.9 / derniere;
  }
  return arbre;
}

const borne = (v: number) => Math.min(1, Math.max(0, v));
const lisser = (v: number) => 1 - (1 - v) ** 3;
const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${a})`;
const melanger = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;

type Point = { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; angle: number; part: number };

/** Où et à quelle taille l'arbre est dessiné. `allonge` l'étire en hauteur (écrans étroits). */
type Cadre = { base: { x: number; y: number }; taille: number; allonge: number };

/** Positions de toutes les branches. `mouvement` ajoute le balancement et l'écart au curseur. */
function placer(
  arbre: Branche[], geo: Point[], flexion: Float32Array, g: number, { base, taille, allonge }: Cadre,
  temps: number, pointeur: { x: number; y: number } | null, mouvement: boolean,
) {
  for (let i = 0; i < arbre.length; i++) {
    const b = arbre[i];
    const parent = b.parent >= 0 ? geo[b.parent] : null;
    const x0 = parent ? parent.x1 : base.x;
    const y0 = parent ? parent.y1 : base.y;
    const balance = mouvement ? Math.sin(temps * 0.9 + b.phase) * 0.016 * b.profondeur : 0;
    const angle = (parent ? parent.angle : 0) + b.angle + balance + flexion[i];
    const longueur = b.longueur * taille;
    if (mouvement) {
      let cible = 0;
      if (pointeur) {
        const fx = x0 + Math.cos(angle) * longueur;
        const fy = y0 + Math.sin(angle) * longueur * allonge;
        const d = Math.hypot(fx - pointeur.x, fy - pointeur.y);
        if (d < RAYON) {
          // de quel côté de la branche est le curseur : elle tourne dans l'autre sens
          const cote = Math.cos(angle) * (pointeur.y - y0) - Math.sin(angle) * (pointeur.x - x0);
          cible = -Math.sign(cote) * (1 - d / RAYON) ** 2 * 0.5;
        }
      }
      flexion[i] += (cible - flexion[i]) * 0.07;
    }
    const part = lisser(borne((g - b.debut) / (b.fin - b.debut)));
    const l = longueur * part;
    const x1 = x0 + Math.cos(angle) * l;
    const y1 = y0 + Math.sin(angle) * l * allonge;
    const p = geo[i];
    p.x0 = x0;
    p.y0 = y0;
    p.x1 = x1;
    p.y1 = y1;
    p.cx = (x0 + x1) / 2 - Math.sin(angle) * b.courbure * l * 0.5;
    p.cy = (y0 + y1) / 2 + Math.cos(angle) * b.courbure * l * 0.5;
    p.angle = angle;
    p.part = part;
  }
}

/** Deux feuilles par famille, aussi éloignées que possible les unes des autres : leurs étiquettes ne se chevauchent pas. */
function choisirEtiquettes(arbre: Branche[], feuilles: number[]): { feuille: number; texte: string; famille: number }[] {
  const geo = arbre.map(() => ({ x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, angle: 0, part: 0 }));
  placer(arbre, geo, new Float32Array(arbre.length), 1, { base: { x: 0, y: 0 }, taille: 1, allonge: 1 }, 0, null, false);
  const choisies: number[] = [];
  const ecart = (a: number, b: number) => Math.hypot((geo[a].x1 - geo[b].x1) * 0.6, (geo[a].y1 - geo[b].y1) * 1.8);
  for (let tour = 0; tour < 2; tour++) {
    for (let f = 0; f < FAMILLES.length; f++) {
      const candidates = feuilles.filter((i) => arbre[i].famille === f && !choisies.includes(i));
      const meilleure = choisies.length === 0
        ? candidates.reduce((a, b) => (geo[b].y1 < geo[a].y1 ? b : a))
        : candidates.reduce((a, b) =>
          Math.min(...choisies.map((c) => ecart(b, c))) > Math.min(...choisies.map((c) => ecart(a, c))) ? b : a);
      choisies.push(meilleure);
    }
  }
  return choisies.map((feuille, k) => ({ feuille, famille: k % 4, texte: FAMILLES[k % 4].exemples[Math.floor(k / 4)] }));
}

export function Reseau() {
  const section = useRef<HTMLElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const textes = useRef<HTMLDivElement>(null);
  const [etape, setEtape] = useState(0);
  const reduit = useMoinsDAnimations();

  useEffect(() => {
    const s = section.current;
    const c = toile.current;
    const ctx = c?.getContext("2d");
    if (!s || !c || !ctx) return;

    const arbre = construireArbre();
    const feuilles = arbre.flatMap((b, i) => (b.enfants.length === 0 ? [i] : []));
    const etiquettes = choisirEtiquettes(arbre, feuilles);
    const flexion = new Float32Array(arbre.length);
    const geo: Point[] = arbre.map(() => ({ x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, angle: 0, part: 0 }));
    const signaux: { chemin: number[]; debut: number }[] = [];
    let largeur = 0;
    let hauteur = 0;
    let cadre: Cadre = { base: { x: 0, y: 0 }, taille: 1, allonge: 1 };
    // position de chaque étiquette par rapport à sa feuille, calculée une fois l'arbre posé
    let places: ({ ancre: "avant" | "apres"; dy: number } | null)[] = [];
    let police = "sans-serif";
    // bord droit de la colonne de texte : les étiquettes ne passent pas dessous
    let limite = 0;
    let avancement = 0;
    let visible = false;
    let image = 0;
    let precedent = 0;
    let temps = 0;
    let prochainSignal = 0;
    let eclat = 0;
    let pointeur: { x: number; y: number } | null = null;

    const dimensionner = () => {
      const zone = c.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      largeur = zone.width;
      hauteur = zone.height;
      c.width = Math.round(largeur * dpr);
      c.height = Math.round(hauteur * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const etroit = largeur < 768;
      cadre = etroit
        ? { base: { x: largeur * 0.5, y: hauteur * 0.9 }, taille: Math.min(hauteur * 0.45, largeur * 0.9), allonge: 1.45 }
        : { base: { x: largeur * 0.66, y: hauteur * 0.89 }, taille: Math.min(hauteur * 0.92, largeur * 0.5), allonge: 1 };
      police = getComputedStyle(c).fontFamily;
      limite = !etroit && textes.current ? textes.current.getBoundingClientRect().right - zone.left + 16 : 0;
      placerEtiquettes();
    };

    /**
     * Pose les étiquettes sur l'arbre au repos, une fois pour toutes : chacune essaie d'abord le côté
     * extérieur, puis l'autre, puis un peu plus haut ou plus bas. Celle qui ne trouve aucune place libre
     * (ni sur le texte, ni sous la barre du haut, ni sur une autre étiquette) n'est pas affichée.
     */
    const placerEtiquettes = () => {
      const repos: Point[] = arbre.map(() => ({ x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, angle: 0, part: 0 }));
      placer(arbre, repos, new Float32Array(arbre.length), 1, cadre, 0, null, false);
      ctx.font = `500 ${largeur < 768 ? 11 : 12}px ${police}`;
      const prises = [{ g: cadre.base.x - 80, d: cadre.base.x + 80, h: cadre.base.y + 10, b: cadre.base.y + 50 }];
      const nombre = largeur < 768 ? 4 : etiquettes.length;
      places = etiquettes.map((e, k) => {
        if (k >= nombre) return null;
        const p = repos[e.feuille];
        const l = ctx.measureText(e.texte).width + 30;
        const cotes: ("avant" | "apres")[] = p.x1 < cadre.base.x ? ["avant", "apres"] : ["apres", "avant"];
        for (const dy of [0, -30, 30, -58, 58]) {
          for (const ancre of cotes) {
            const gauche = ancre === "avant" ? p.x1 - 12 - l : p.x1 + 12;
            const r = { g: gauche - 4, d: gauche + l + 4, h: p.y1 + dy - 15, b: p.y1 + dy + 15 };
            if (r.g < Math.max(4, limite) || r.d > largeur - 4 || r.h < 76 || r.b > hauteur - 4) continue;
            if (prises.some((q) => r.g < q.d && r.d > q.g && r.h < q.b && r.b > q.h)) continue;
            prises.push(r);
            return { ancre, dy };
          }
        }
        return null;
      });
    };

    const croissance = () => (reduit ? 1 : borne((avancement - POUSSE_DEBUT) / (POUSSE_FIN - POUSSE_DEBUT)));

    /** Point d'une branche, de son pied (t = 0) à son bout (t = 1). */
    const sur = (p: Point, t: number) => ({
      x: (1 - t) ** 2 * p.x0 + 2 * (1 - t) * t * p.cx + t * t * p.x1,
      y: (1 - t) ** 2 * p.y0 + 2 * (1 - t) * t * p.cy + t * t * p.y1,
    });

    const couleur = (b: Branche): Rgb => (b.famille < 0 ? TRONC : b.profondeur === 1
      ? melanger(TRONC, FAMILLES[b.famille].couleur, 0.5) : FAMILLES[b.famille].couleur);

    /** Étiquette arrondie : `ancre` dit si elle se pose avant le point x, après lui ou centrée dessus. */
    const pilule = (x: number, y: number, texte: string, teinte: Rgb, opacite: number, ancre: "avant" | "apres" | "centre", forte = false) => {
      ctx.font = `${forte ? 600 : 500} ${largeur < 768 ? 11 : 12}px ${police}`;
      const l = ctx.measureText(texte).width + (forte ? 24 : 30);
      const hp = forte ? 28 : 24;
      let gauche = ancre === "avant" ? x - l : ancre === "centre" ? x - l / 2 : x;
      gauche = Math.min(largeur - l - 8, Math.max(8, gauche));
      ctx.globalAlpha = opacite;
      ctx.beginPath();
      ctx.roundRect(gauche, y - hp / 2, l, hp, hp / 2);
      ctx.fillStyle = forte ? "rgba(255,255,255,0.1)" : "rgba(11,11,15,0.82)";
      ctx.fill();
      ctx.strokeStyle = rgba(teinte, forte ? 0.35 : 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (!forte) {
        ctx.beginPath();
        ctx.arc(gauche + 12, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = rgba(teinte, 1);
        ctx.fill();
      }
      ctx.fillStyle = forte ? "#fff" : "#d8d8e2";
      ctx.textBaseline = "middle";
      ctx.fillText(texte, gauche + (forte ? 12 : 21), y + 0.5);
      ctx.globalAlpha = 1;
    };

    const dessiner = (g: number, mouvement: boolean) => {
      const { base, taille } = cadre;
      ctx.clearRect(0, 0, largeur, hauteur);
      ctx.globalCompositeOperation = "lighter";
      const lueur = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, taille * 0.7);
      lueur.addColorStop(0, rgba([139, 155, 255], 0.14 + 0.1 * g + eclat * 0.12));
      lueur.addColorStop(1, rgba([139, 155, 255], 0));
      ctx.fillStyle = lueur;
      ctx.fillRect(0, 0, largeur, hauteur);

      const finesse = Math.min(1.2, Math.max(0.7, taille / 700));
      ctx.lineCap = "round";
      for (const halo of [true, false]) {
        for (let i = 0; i < arbre.length; i++) {
          const p = geo[i];
          if (p.part <= 0) continue;
          const b = arbre[i];
          ctx.beginPath();
          ctx.moveTo(p.x0, p.y0);
          ctx.quadraticCurveTo(p.cx, p.cy, p.x1, p.y1);
          ctx.strokeStyle = rgba(couleur(b), halo ? 0.06 : 0.8 - b.profondeur * 0.08);
          ctx.lineWidth = [3.2, 2.2, 1.6, 1.2, 0.95, 0.8][b.profondeur] * finesse * (halo ? 4 : 1);
          ctx.stroke();
        }
      }

      // un point à chaque fourche, une offre au bout de chaque rameau
      for (let i = 0; i < arbre.length; i++) {
        const b = arbre[i];
        const p = geo[i];
        if (p.part < 1 || b.famille < 0) continue;
        const venue = borne((g - b.fin) / 0.05);
        if (b.enfants.length > 0) {
          ctx.beginPath();
          ctx.arc(p.x1, p.y1, 1.6 * venue, 0, Math.PI * 2);
          ctx.fillStyle = rgba(couleur(b), 0.55);
          ctx.fill();
          continue;
        }
        const scintille = mouvement ? 0.75 + 0.25 * Math.sin(temps * 2.2 + b.phase) : 1;
        ctx.beginPath();
        ctx.arc(p.x1, p.y1, 7 * venue, 0, Math.PI * 2);
        ctx.fillStyle = rgba(couleur(b), 0.13 * scintille);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x1, p.y1, 3 * venue, 0, Math.PI * 2);
        ctx.fillStyle = rgba(melanger(couleur(b), [255, 255, 255], 0.35), 0.95);
        ctx.fill();
      }

      // les alertes : un signal qui descend d'une offre jusqu'à votre entreprise
      for (let k = signaux.length - 1; k >= 0; k--) {
        const signal = signaux[k];
        const u = (temps - signal.debut) / 1.8;
        if (u >= 1) {
          signaux.splice(k, 1);
          eclat = 1;
          continue;
        }
        const teinte = couleur(arbre[signal.chemin[0]]);
        const depart = geo[signal.chemin[0]];
        if (u < 0.25) {
          ctx.beginPath();
          ctx.arc(depart.x1, depart.y1, 6 + u * 60, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(teinte, 0.5 * (1 - u * 4));
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        for (let trace = 0; trace < 6; trace++) {
          const v = u - trace * 0.012;
          if (v < 0) break;
          const pas = lisser(v) * signal.chemin.length;
          const segment = Math.min(signal.chemin.length - 1, Math.floor(pas));
          const point = sur(geo[signal.chemin[segment]], 1 - (pas - segment));
          ctx.beginPath();
          ctx.arc(point.x, point.y, (trace === 0 ? 2.4 : 1.8) * (1 - trace / 7), 0, Math.PI * 2);
          ctx.fillStyle = rgba(melanger(teinte, [255, 255, 255], 0.5), 0.9 - trace * 0.13);
          ctx.fill();
          if (trace === 0) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
            ctx.fillStyle = rgba(teinte, 0.18);
            ctx.fill();
          }
        }
      }

      // votre entreprise, au pied de l'arbre
      if (mouvement) {
        for (let k = 0; k < 2; k++) {
          const phase = (temps * 0.45 + k * 0.5) % 1;
          ctx.beginPath();
          ctx.arc(base.x, base.y, 12 + phase * 64, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(TRONC, 0.32 * (1 - phase));
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      const coeur = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, 46);
      coeur.addColorStop(0, rgba([255, 255, 255], 0.55 + eclat * 0.4));
      coeur.addColorStop(1, rgba(TRONC, 0));
      ctx.fillStyle = coeur;
      ctx.beginPath();
      ctx.arc(base.x, base.y, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(base.x, base.y, 8 + eclat * 2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      etiquettes.forEach((e, k) => {
        const place = places[k];
        const p = geo[e.feuille];
        const venue = borne((g - arbre[e.feuille].fin - 0.02) / 0.06);
        if (!place || venue <= 0 || p.part < 1) return;
        const teinte = FAMILLES[e.famille].couleur;
        const x = p.x1 + (place.ancre === "avant" ? -12 : 12);
        const y = p.y1 + place.dy - (1 - venue) * 6;
        if (place.dy !== 0) {
          // l'étiquette a dû s'écarter de sa feuille : un trait fin les relie
          ctx.globalAlpha = venue;
          ctx.beginPath();
          ctx.moveTo(p.x1, p.y1);
          ctx.lineTo(x, y);
          ctx.strokeStyle = rgba(teinte, 0.35);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        pilule(x, y, e.texte, teinte, venue, place.ancre);
      });
      pilule(base.x, base.y + 30, "Votre entreprise", TRONC, 1, "centre", true);
    };

    const boucle = (maintenant: number) => {
      const dt = Math.min(0.05, Math.max(0, (maintenant - precedent) / 1000));
      precedent = maintenant;
      temps += dt;
      eclat = Math.max(0, eclat - dt * 1.6);
      const g = croissance();
      if (g >= 1 && temps > prochainSignal && signaux.length < 7) {
        let i = feuilles[Math.floor(Math.random() * feuilles.length)];
        const chemin: number[] = [];
        while (i >= 0) {
          chemin.push(i);
          i = arbre[i].parent;
        }
        signaux.push({ chemin, debut: temps });
        prochainSignal = temps + 0.35 + Math.random() * 0.45;
      }
      placer(arbre, geo, flexion, g, cadre, temps, pointeur, true);
      dessiner(g, true);
      image = visible && !document.hidden ? requestAnimationFrame(boucle) : 0;
    };

    const fixe = () => {
      placer(arbre, geo, flexion, croissance(), cadre, 0, null, false);
      dessiner(croissance(), false);
    };
    const relancer = () => {
      if (reduit) return fixe();
      if (!image && visible && !document.hidden) {
        precedent = performance.now();
        image = requestAnimationFrame(boucle);
      }
    };

    dimensionner();
    fixe();
    let fini = false;
    document.fonts?.ready.then(() => {
      if (fini) return;
      dimensionner();
      fixe();
    });
    const arreterDefilement = suivreDefilement(s, (p) => {
      avancement = p;
      let n = 0;
      while (n + 1 < SEUILS.length && p >= SEUILS[n + 1]) n++;
      setEtape(n);
      if (reduit) fixe();
    });
    const observateur = new IntersectionObserver(([entree]) => {
      visible = entree.isIntersecting;
      relancer();
    });
    observateur.observe(s);
    const redimension = new ResizeObserver(() => {
      dimensionner();
      fixe();
    });
    redimension.observe(c);
    const bouger = (e: PointerEvent) => {
      const cadre = c.getBoundingClientRect();
      pointeur = { x: e.clientX - cadre.left, y: e.clientY - cadre.top };
    };
    const quitter = () => (pointeur = null);
    c.addEventListener("pointermove", bouger);
    c.addEventListener("pointerleave", quitter);
    document.addEventListener("visibilitychange", relancer);
    return () => {
      fini = true;
      arreterDefilement();
      observateur.disconnect();
      redimension.disconnect();
      c.removeEventListener("pointermove", bouger);
      c.removeEventListener("pointerleave", quitter);
      document.removeEventListener("visibilitychange", relancer);
      cancelAnimationFrame(image);
    };
  }, [reduit]);

  return (
    <section id="reseau" ref={section} className="relative" style={{ height: "420svh" }}>
      <div className="sticky top-0 h-svh overflow-hidden">
        <canvas ref={toile} className="absolute inset-0 size-full" aria-hidden="true" />
        <div ref={textes} className="reseau-textes pointer-events-none">
          <h2 className="surtitre">Comment ça marche</h2>
          <div className="grid">
            {ETAPES.map((e, i) => (
              <div key={e.titre} className="reseau-etape" data-actif={i === etape ? "oui" : "non"}>
                <h3 className="text-[26px] leading-[1.1] font-medium tracking-[-0.03em] sm:text-[40px]">{e.titre}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[#a3a3b2] sm:mt-4 sm:text-base">{e.texte}</p>
              </div>
            ))}
          </div>
          <ol className="reseau-progres" aria-hidden="true">
            {ETAPES.map((e, i) => <li key={e.titre} data-fait={i <= etape ? "oui" : "non"} />)}
          </ol>
          <ul className="reseau-legende" data-visible={etape >= 2 ? "oui" : "non"}>
            {FAMILLES.map((f) => (
              <li key={f.nom}>
                <span style={{ background: rgba(f.couleur, 1) }} />
                {f.nom}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
