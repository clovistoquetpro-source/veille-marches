import { describe, expect, it } from "vitest";
import { type AvisTed, lireAvisTed } from "../src/ingest/ted";

/** Les fixtures reprennent la forme des réponses réelles de l'API de recherche TED v3. */
function avisTed(champs: Partial<AvisTed>): AvisTed {
  return {
    "publication-number": "677877-2026",
    "notice-type": "cn-standard",
    "publication-date": "2026-10-02+02:00",
    ...champs,
  };
}

describe("avis de TED", () => {
  it("lit un avis de marché : département du lieu d'exécution, date limite la plus proche, valeur estimée", () => {
    const avis = lireAvisTed(avisTed({
      "title-proc": { fra: "Maintenance des installations de détection incendie" },
      "buyer-name": { fra: ["Banque de France"] },
      "buyer-identifier": ["57210489100997"],
      "buyer-post-code": ["75001"],
      "main-classification-proc": ["50413200"],
      "contract-nature-main-proc": "services",
      "place-of-performance-subdiv-proc": ["FRK14"],
      "deadline-receipt-tender-date-lot": ["2026-11-06+01:00", "2026-11-04+01:00"],
      "estimated-value-proc": "300000",
      "total-value": 300000,
    }));
    expect(avis).toEqual({
      uid: "ted-677877-2026", source: "ted", numero: "677877-2026", type: "marche",
      objet: "Maintenance des installations de détection incendie", acheteur_nom: "Banque de France",
      acheteur_siret: "57210489100997", cpv: "50413200", famille: "services", descripteurs: null,
      departements: ["63"], date_publication: "2026-10-02", date_limite: "2026-11-04", montant: 300000,
      offres_recues: null, url: "https://ted.europa.eu/fr/notice/-/detail/677877-2026", avis_initial: null,
      titulaires: [],
    });
  });

  it("lit une attribution : titulaires appariés à leur identifiant, nombre d'offres commun à tous les lots", () => {
    const avis = lireAvisTed(avisTed({
      "notice-type": "can-standard",
      "title-proc": { fra: "Titres restaurant" },
      "buyer-identifier": ["1"],
      "buyer-post-code": ["97112"],
      "main-classification-proc": ["30199770"],
      "winner-name": { fra: ["EDENRED FRANCE", "LINDE", "EDENRED FRANCE"] },
      "winner-identifier": ["393365135", "392 631 248 00359", "393365135"],
      "BT-759-LotResult": ["3", "3"],
      "total-value": 442932,
    }));
    expect(avis).toMatchObject({
      type: "attribution", acheteur_siret: null, departements: ["971"], famille: "fournitures", montant: 442932,
      offres_recues: 3,
      titulaires: [
        { nom: "EDENRED FRANCE", identifiant: "393365135" },
        { nom: "LINDE", identifiant: "39263124800359" },
      ],
    });
  });

  it("ne garde que les noms quand les identifiants ne correspondent pas, et pas de nombre d'offres si les lots diffèrent", () => {
    const avis = lireAvisTed(avisTed({
      "notice-type": "can-standard",
      "winner-name": { fra: ["ACSE", "AQUA ENERGY"] },
      "winner-identifier": ["1800932-1-1-1"],
      "BT-759-LotResult": ["14", "13"],
    }));
    expect(avis.titulaires).toEqual([{ nom: "ACSE", identifiant: null }, { nom: "AQUA ENERGY", identifiant: null }]);
    expect(avis.offres_recues).toBeNull();
    expect(avis.objet).toBe("Objet non publié");
  });

  it("classe les avis de modification en rectificatifs et les pré-informations à part", () => {
    expect(lireAvisTed(avisTed({ "change-notice-version-identifier": "280438d4-01" })).type).toBe("rectificatif");
    expect(lireAvisTed(avisTed({ "notice-type": "pin-only" })).type).toBe("preinformation");
    expect(lireAvisTed(avisTed({ "notice-type": "veat" })).type).toBe("attribution");
    expect(lireAvisTed(avisTed({ "notice-type": "can-modif" })).type).toBe("modification");
  });

  it("prend le titre dans une autre langue s'il n'y a pas de français", () => {
    expect(lireAvisTed(avisTed({ "title-proc": { eng: "Cleaning services" } })).objet).toBe("Cleaning services");
  });
});
