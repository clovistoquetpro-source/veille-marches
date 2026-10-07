/**
 * Polices de la charte Sonar Public : Manrope pour le texte, Sora pour les grands titres.
 * Sora est exposée en variable CSS (--font-sora) sur toute la page, Manrope en classe sur les pages au
 * nouveau design.
 */
import { Manrope, Sora } from "next/font/google";

export const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const sora = Sora({ subsets: ["latin"], weight: ["600"], display: "swap", variable: "--font-sora" });
