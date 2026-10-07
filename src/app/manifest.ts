import type { MetadataRoute } from "next";
import { NOM } from "@/lib/produit";

/** Ce que le téléphone affiche quand on ajoute le site à l'écran d'accueil. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOM,
    short_name: NOM,
    start_url: "/veille",
    display: "standalone",
    background_color: "#0B0B0F",
    theme_color: "#0B0B0F",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icone-app-512.png", type: "image/png", sizes: "512x512" },
    ],
  };
}
