import { afterEach, describe, expect, it, vi } from "vitest";
import { chercherEntreprise, INDISPONIBLE } from "../src/lib/annuaire";

afterEach(() => vi.unstubAllGlobals());

/** Forme réelle (abrégée) d'une réponse de recherche-entreprises.api.gouv.fr. */
const REPONSE = {
  results: [{
    siren: "482818523",
    nom_complet: "HTP CENTRE EST",
    activite_principale: "81.22Z",
    etat_administratif: "A",
    siege: { siret: "48281852300029", departement: "69", code_postal: "69120", libelle_commune: "VAULX-EN-VELIN" },
    matching_etablissements: [
      // la recherche par SIRET ne renvoie pas le département de l'établissement, seulement son code postal
      { siret: "48281852300037", code_postal: "01000", libelle_commune: "BOURG-EN-BRESSE" },
    ],
  }],
};

function reponse(corps: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(corps), { status })));
}

describe("annuaire des entreprises", () => {
  it("lit le nom, l'activité et le département du siège à partir d'un SIREN", async () => {
    reponse(REPONSE);
    expect(await chercherEntreprise("482 818 523")).toEqual({
      siren: "482818523", siret: "48281852300029", nom: "HTP CENTRE EST", naf: "81.22Z",
      departement: "69", commune: "VAULX-EN-VELIN", active: true,
    });
  });

  it("prend l'établissement demandé et déduit son département de son code postal", async () => {
    reponse(REPONSE);
    expect(await chercherEntreprise("48281852300037")).toMatchObject({
      siret: "48281852300037", departement: "01", commune: "BOURG-EN-BRESSE",
    });
  });

  it("ne renvoie rien si le numéro est mal formé ou inconnu", async () => {
    reponse(REPONSE);
    expect(await chercherEntreprise("4828185")).toBeNull();
    reponse({ results: [] });
    expect(await chercherEntreprise("123456789")).toBeNull();
    reponse(REPONSE);
    expect(await chercherEntreprise("123456789")).toBeNull(); // l'annuaire a répondu une autre entreprise
    reponse({}, 400);
    expect(await chercherEntreprise("482818523")).toBeNull();
  });

  it("distingue une panne d'un numéro inconnu, et réessaie quand l'API limite le débit", async () => {
    reponse({}, 500);
    expect(await chercherEntreprise("482818523", 1)).toBe(INDISPONIBLE);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await chercherEntreprise("482818523", 1)).toBe(INDISPONIBLE);
    const appels = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(REPONSE)));
    vi.stubGlobal("fetch", appels);
    expect(await chercherEntreprise("482818523", 2)).toMatchObject({ nom: "HTP CENTRE EST" });
    expect(appels).toHaveBeenCalledTimes(2);
  });
});
