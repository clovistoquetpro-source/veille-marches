import { describe, expect, it } from "vitest";
import { normaliserEmail } from "../src/lib/comptes";
import {
  type HistoriqueEntreprise, nettoyerProfil, profilDepuisHistorique, profilDepuisNaf,
} from "../src/lib/profil";

function historique(champs: Partial<HistoriqueEntreprise> = {}): HistoriqueEntreprise {
  return {
    siren: "111111111", nom: "NETTOYAGE DU RHONE", naf: "81.21Z", naf_libelle: "Nettoyage courant des bâtiments",
    marches: 6, cpv: [{ code: "90910", marches: 4 }, { code: "90911", marches: 2 }, { code: "45261", marches: 1 }],
    departements: [{ code: "69", marches: 5 }, { code: "01", marches: 1 }], nb_departements: 2, objets: [],
    ...champs,
  };
}

describe("profil déduit des marchés déjà gagnés", () => {
  it("garde les classes CPV qui reviennent et les départements de ses acheteurs", () => {
    expect(profilDepuisHistorique(historique())).toEqual({
      cpv: ["90910", "90911"], mots_cles: [], departements: ["69", "01"], origine: "historique",
    });
  });

  it("ne propose aucun département à une entreprise qui a déjà gagné partout", () => {
    const profil = profilDepuisHistorique(historique({ nb_departements: 12 }));
    expect(profil?.departements).toEqual([]);
  });

  it("garde les classes vues une seule fois quand c'est tout ce qu'on a", () => {
    const profil = profilDepuisHistorique(historique({ cpv: [{ code: "45261", marches: 1 }], marches: 3 }));
    expect(profil?.cpv).toEqual(["45261"]);
  });

  it("renvoie null quand l'entreprise n'a pas assez d'historique public", () => {
    expect(profilDepuisHistorique(historique({ marches: 2 }))).toBeNull();
    expect(profilDepuisHistorique(historique({ cpv: [] }))).toBeNull();
  });
});

describe("profil de repli et nettoyage", () => {
  it("tire les mots significatifs de l'activité déclarée, sans répétition", () => {
    expect(profilDepuisNaf("Autres activités de nettoyage des bâtiments et nettoyage industriel")).toEqual({
      cpv: [], mots_cles: ["nettoyage", "bâtiments", "industriel"], departements: [], origine: "manuel",
    });
    expect(profilDepuisNaf(null).mots_cles).toEqual([]);
  });

  it("écarte ce qui n'est ni un préfixe CPV, ni un mot-clé, ni un département", () => {
    expect(nettoyerProfil({
      cpv: ["90910000-9", "9", "90910000", "45"],
      mots_cles: ["  Nettoyage ", "NETTOYAGE", "x", "a".repeat(50)],
      departements: ["69", "2a", "971", "99", "69"],
    })).toEqual({
      cpv: ["90910000", "45"], mots_cles: ["nettoyage"], departements: ["69", "2A", "971"],
    });
  });
});

describe("adresse électronique", () => {
  it("accepte une adresse normale et refuse le reste", () => {
    expect(normaliserEmail("  Clo@Exemple.FR ")).toBe("clo@exemple.fr");
    expect(normaliserEmail("clo@exemple")).toBeNull();
    expect(normaliserEmail("clo exemple.fr")).toBeNull();
  });
});
