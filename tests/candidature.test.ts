import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { composerDC1, composerDC2, lireLots, nomDeFichier, type AvisCandidature, type Candidat } from "../src/lib/candidature";
import { documentWord, echapperXml } from "../src/lib/docx";

const AVIS: AvisCandidature = {
  uid: "boamp-26-94446", source: "boamp", numero: "26-94446", type: "marche",
  objet: "Nettoyage des locaux <bâtiment A> & annexes", acheteur_nom: "Ville de Lyon", acheteur_siret: "21690123100011",
  famille: "services", date_publication: "2026-10-02", date_limite: "2026-11-04", url: "https://www.boamp.fr/avis/detail/26-94446",
};

const CANDIDAT: Candidat = {
  siren: "482818523", siret: "48281852300037", denomination: "HTP CENTRE EST", enseigne: "HTP PROPRETÉ",
  adresse: "12 RUE DU PORT 01000 BOURG-EN-BRESSE", adresse_siege: "3 RUE DES ÉCOLES 69120 VAULX-EN-VELIN",
  forme_juridique: "SAS, société par actions simplifiée", pme: true, naf: "81.22Z", naf_libelle: "Autres activités de nettoyage des bâtiments",
  effectif: "20 à 49 salariés", date_creation: "2005-03-01",
  chiffres_affaires: [{ annee: "2024", ca: 2_400_000 }, { annee: "2023", ca: 2_100_000 }],
  email: "contact@htp.fr", telephone: "04 72 00 00 00", origine: "annuaire",
};

/** Texte visible d'un .docx : on dézippe et on enlève les balises. */
function texteDu(docx: Uint8Array): string {
  const fichiers = unzipSync(docx);
  expect(Object.keys(fichiers)).toEqual(expect.arrayContaining(["[Content_Types].xml", "word/document.xml", "word/footer1.xml"]));
  return strFromU8(fichiers["word/document.xml"]).replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

describe("formulaires de candidature", () => {
  it("remplit le DC1 avec l'avis et l'entreprise, sans cocher la déclaration sur l'honneur", () => {
    const texte = texteDu(documentWord(composerDC1(AVIS, CANDIDAT, { cas: "sans_lots" }), "DC1"));
    expect(texte).toContain("Ville de Lyon");
    expect(texte).toContain("Avis n° 26-94446 publié au BOAMP le 02/10/2026");
    expect(texte).toContain("Nettoyage des locaux <bâtiment A> & annexes");
    expect(texte).toContain("HTP PROPRETÉ – HTP CENTRE EST");
    expect(texte).toContain("Siège social : 3 RUE DES ÉCOLES 69120 VAULX-EN-VELIN");
    expect(texte).toContain("48281852300037");
    expect(texte).toContain("☒ pour le marché public");
    expect(texte).toContain("☐ pour tous les lots");
    expect(texte).toContain("☒ Le candidat se présente seul");
    expect(texte).toContain("☐ Afin d'attester que le candidat n'est pas dans un de ces cas d'exclusion");
    expect(texte).toContain("☒ le formulaire DC2.");
  });

  it("remplit le DC2 : forme juridique, PME, SIREN, chiffres d'affaires et effectif", () => {
    const texte = texteDu(documentWord(composerDC2(AVIS, CANDIDAT, { cas: "certains", lots: "1 et 3" }), "DC2"));
    expect(texte).toContain("SAS, société par actions simplifiée");
    expect(texte).toContain("☒ Oui");
    expect(texte).toContain("☐ Non");
    expect(texte).toContain("Lot(s) concerné(s) par cette candidature : 1 et 3");
    expect(texte).toContain("81.22Z – Autres activités de nettoyage des bâtiments");
    expect(texte).toContain("Exercice clos en 2024");
    expect(texte).toMatch(/2\s400\s000\s€/);
    expect(texte).toContain("01/03/2005");
    expect(texte).toContain("20 à 49 salariés");
  });

  it("laisse des pointillés là où on ne sait rien, et ne coche pas PME sans le savoir", () => {
    const inconnu: Candidat = {
      ...CANDIDAT, adresse: null, adresse_siege: null, telephone: null, pme: null, chiffres_affaires: [], date_creation: null,
    };
    const texte = texteDu(documentWord(composerDC2(AVIS, inconnu, { cas: "sans_lots" }), "DC2"));
    expect(texte).toMatch(/Numéros de téléphone et de télécopie : …/);
    expect(texte).toContain("☐ Oui");
    expect(texte).toContain("Vos comptes ne sont pas publiés");
  });

  it("produit un XML valide même avec des caractères spéciaux", () => {
    expect(echapperXml(`a < b & "c" > d\u0001`)).toBe("a &lt; b &amp; &quot;c&quot; &gt; d");
    const xml = strFromU8(unzipSync(documentWord(composerDC1(AVIS, CANDIDAT, { cas: "tous" }), "DC1 & co"))["word/footer1.xml"]);
    expect(xml).toContain("DC1 &amp; co");
  });

  it("lit le choix des lots et nomme le fichier", () => {
    expect(lireLots("certains", " 2 ")).toEqual({ cas: "certains", lots: "2" });
    expect(lireLots("certains", "")).toEqual({ cas: "sans_lots" });
    expect(lireLots("tous", null)).toEqual({ cas: "tous" });
    expect(lireLots(null, null)).toEqual({ cas: "sans_lots" });
    expect(nomDeFichier("dc2", AVIS)).toBe("DC2-boamp-26-94446.docx");
  });
});
