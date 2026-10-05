import { describe, expect, it } from "vitest";
import { identifiantEntreprise } from "../src/ingest/avis";
import { analyserTexteAttribution, type EnregistrementBoamp, lireAvisBoamp } from "../src/ingest/boamp";

/** Enregistrement minimal ; les fixtures reprennent la forme des avis réels du BOAMP. */
function enregistrement(champs: Partial<EnregistrementBoamp>, donnees?: unknown): EnregistrementBoamp {
  return {
    idweb: "26-00001", objet: "Objet", nomacheteur: "Ville de Test", titulaire: null, code_departement: ["69"],
    dateparution: "2026-10-02", datelimitereponse: null, nature: "APPEL_OFFRE", famille: "FNS",
    type_marche: ["SERVICES"], descripteur_libelle: null, url_avis: null, annonce_lie: null,
    donnees: donnees === undefined ? null : JSON.stringify(donnees),
    ...champs,
  };
}

describe("avis du BOAMP", () => {
  it("lit un avis de marché « FNSimple » : CPV, SIRET de l'acheteur, date limite à Paris", () => {
    const avis = lireAvisBoamp(enregistrement(
      {
        idweb: "26-95337", objet: "Travaux de restructuration du collège - Lot 07", code_departement: ["1", "73"],
        datelimitereponse: "2026-09-30T22:30:00+00:00", type_marche: ["TRAVAUX"], descripteur_libelle: ["Bardage"],
      },
      {
        FNSimple: {
          organisme: { nomOfficiel: "Semcoda", typeIdentificationNational: { siret: "" }, codeIdentificationNational: "759 200 751 00130", cp: "01000" },
          initial: { natureMarche: { codeCPV: { objetPrincipal: { classPrincipale: "45454000" } }, dureeMois: "33" } },
        },
      },
    ));
    expect(avis).toMatchObject({
      uid: "boamp-26-95337", source: "boamp", type: "marche", objet: "Travaux de restructuration du collège - Lot 07",
      acheteur_siret: "75920075100130", cpv: "45454000", famille: "travaux", descripteurs: ["Bardage"],
      departements: ["01", "73"], date_publication: "2026-10-02",
      // 22 h 30 UTC = 0 h 30 le lendemain à Paris (heure d'été)
      date_limite: "2026-10-01",
      url: "https://www.boamp.fr/pages/avis/?q=idweb:26-95337", titulaires: [],
    });
  });

  it("lit une attribution « FNSimple » rédigée en texte libre", () => {
    const avis = lireAvisBoamp(enregistrement(
      { nature: "ATTRIBUTION", annonce_lie: ["26-88531"] },
      {
        FNSimple: {
          attribution: {
            avisInitial: { idWeb: "26-71037" },
            natureMarche: { codeCPV: { objetPrincipal: { classPrincipale: "71247000" } } },
            attributionMarche: "Nombre d'offres reçues : 8\nDate d'attribution : 01/10/26\nMarché n° : 2026 Tx\n" +
              "Entreprise De Travaux Fayolle Et Fils, 30 Rue De L Egalite, 95230 Soisy-Sous-Montmorency\n" +
              "Montant Ht min : 935 220,00 Euros\nSous-traitance : non.",
          },
        },
      },
    ));
    expect(avis).toMatchObject({
      type: "attribution", cpv: "71247000", famille: "services", offres_recues: 8, montant: 935220,
      avis_initial: "26-88531",
      titulaires: [{ nom: "Entreprise De Travaux Fayolle Et Fils", identifiant: null }],
    });
  });

  it("lit une attribution MAPA : titulaire, montant et nombre d'offres structurés", () => {
    const avis = lireAvisBoamp(enregistrement(
      { famille: "MAPA", nature: "ATTRIBUTION", type_marche: ["FOURNITURES"], titulaire: ["Fisher Scientific SAS"] },
      {
        MAPA: {
          organisme: { acheteurPublic: "UCBL1", adr: { cp: "69100" } },
          attribution: {
            avisInitial: { idWeb: "26-60108" },
            attribution: { resultat: { attribue: { titulaire: { PersonneMorale: "Fisher Scientific SAS " }, montant: { "@devise": "EUR", valeur: "50044" } } } },
            autresInformations: { nbOffresRecues: "5" },
          },
        },
      },
    ));
    expect(avis).toMatchObject({
      cpv: null, famille: "fournitures", acheteur_siret: null, montant: 50044, offres_recues: 5,
      avis_initial: "26-60108", titulaires: [{ nom: "Fisher Scientific SAS", identifiant: null }],
    });
  });

  it("laisse les avis européens à TED et classe les autres natures", () => {
    expect(lireAvisBoamp(enregistrement({ famille: "JOUE" }))).toBeNull();
    expect(lireAvisBoamp(enregistrement({ nature: "RECTIFICATIF" }))?.type).toBe("rectificatif");
    expect(lireAvisBoamp(enregistrement({ nature: "ANNULATION" }))?.type).toBe("annulation");
    expect(lireAvisBoamp(enregistrement({ nature: "INCONNUE" }))?.type).toBe("autre");
  });
});

describe("texte libre des attributions", () => {
  it("lit un libellé « Nom du titulaire » et un montant avec point décimal", () => {
    expect(analyserTexteAttribution(
      "Fournitures administratives\nDate de conclusion du contrat : 23/09/2026\nNom du titulaire : GUINTOLI SAS\n" +
        "Montant de l'offre attributaire HT GUINTOLI SAS : 284 782.86 euro(s).",
    )).toEqual({ offres: null, montant: 284782.86, titulaires: [{ nom: "GUINTOLI SAS", identifiant: null }] });
  });

  it("lit « Attributaires X - adresse » sur une seule ligne", () => {
    expect(analyserTexteAttribution(
      " - Attributaires SAS MIRECO - 134 RUE FRANCIS GARNIER  58000 - 02/10/2026 - Montant attribué : 414215 HT ",
    )).toEqual({ offres: null, montant: 414215, titulaires: [{ nom: "SAS MIRECO", identifiant: null }] });
  });

  it("lit une phrase « attribué à l'entreprise X - SIRET … »", () => {
    expect(analyserTexteAttribution(
      "Le marché 2026T055380000 a été attribué à l'entreprise DUBOCQ - SIRET 957 202 476 00025\n" +
        "Prix global forfaitaire: 118 105,94Euros HT.",
    )).toEqual({ offres: null, montant: 118105.94, titulaires: [{ nom: "DUBOCQ", identifiant: "95720247600025" }] });
  });

  it("accepte « SIREN : » suivi d'un SIRET", () => {
    const { titulaires } = analyserTexteAttribution(
      "Le marché a été attribué le 24/08/2026 à l'entreprise : SARL PREVENTIO \n29 rue des bonites\n97434 SAINT GILLES\nSIREN : 50503685500037",
    );
    expect(titulaires).toEqual([{ nom: "SARL PREVENTIO", identifiant: "50503685500037" }]);
  });

  it("lit les titulaires suivis de leur SIRET entre parenthèses", () => {
    expect(analyserTexteAttribution(
      "Lot 1 : Bâtiments administratifs Attribution : attribué à 1 entreprise(s) -  NORD PICARDIE MAINTENANCE SERVICE " +
        "(51892721500054) Notifié le 30/09/2026",
    ).titulaires).toEqual([{ nom: "NORD PICARDIE MAINTENANCE SERVICE", identifiant: "51892721500054" }]);
    expect(analyserTexteAttribution("Le marché a été attribué à la société NORD FOURRAGE (12345678900012).").titulaires)
      .toEqual([{ nom: "NORD FOURRAGE", identifiant: "12345678900012" }]);
  });

  it("lit une ligne par lot « Lot n : NOM situé à … »", () => {
    expect(analyserTexteAttribution(
      "Le pouvoir adjudicateur a décidé d'attribuer les marchés aux sociétés suivantes :\n" +
        "Lot 1 : DBA CONSTRUCTION situé à 87400 SAINT LEONARD DE NOBLAT pour un montant de 139 396.55€ HT.\n" +
        "Lot 2 : COGNAC SCIAGE BETON situé à 16100 MERPINS pour un montant de 124 350.37€ HT.",
    ).titulaires.map((t) => t.nom)).toEqual(["DBA CONSTRUCTION", "COGNAC SCIAGE BETON"]);
  });

  it("lit « notifié le … à la SARL X pour … »", () => {
    expect(analyserTexteAttribution(
      "Le marché a été notifié le 02/10/2026 à la SARL 2 LIVES pour une durée de 12 mois.",
    ).titulaires).toEqual([{ nom: "SARL 2 LIVES", identifiant: null }]);
  });

  it("ne trouve pas de titulaire dans un avis infructueux ni dans une phrase d'explication", () => {
    expect(analyserTexteAttribution("Nombre d'offres reçues : 1\nCet avis a été déclaré Infructueux"))
      .toEqual({ offres: 1, montant: null, titulaires: [] });
    expect(analyserTexteAttribution(
      "Les montants indiqués sont les montants maximums sur la durée globale de l'accord-cadre, 75001 Paris",
    ).titulaires).toEqual([]);
  });
});

describe("identifiants d'entreprise", () => {
  it("garde les SIRET et SIREN, convertit la TVA française, écarte le reste", () => {
    expect(identifiantEntreprise("392 631 248 00359")).toBe("39263124800359");
    expect(identifiantEntreprise("393365135")).toBe("393365135");
    expect(identifiantEntreprise("FR40303265045")).toBe("303265045");
    expect(identifiantEntreprise("1800932-1-1-1")).toBeNull();
    expect(identifiantEntreprise("00000000000000")).toBeNull();
    expect(identifiantEntreprise(null)).toBeNull();
  });
});
