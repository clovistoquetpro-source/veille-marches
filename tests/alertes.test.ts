import { describe, expect, it } from "vitest";
import { composerAlerte, type AvisAlerte, type Destinataire, type MarcheAlerte } from "../src/lib/alertes";
import type { Gain } from "../src/lib/concurrents";
import { euros } from "../src/lib/format";

const DESTINATAIRE: Destinataire = {
  compte_id: "c1", email: "clo@exemple.fr", nom: "NETTOYAGE DU RHONE", jeton: "abc123",
  profil: { cpv: ["90910"], mots_cles: [], departements: ["69"], origine: "historique" },
};

const AVIS: AvisAlerte = {
  uid: "boamp-26-1", objet: "Nettoyage des écoles", acheteur_nom: "Ville de Test",
  departements: ["69"], date_limite: "2026-11-02", url: "https://www.boamp.fr/pages/avis/?q=idweb:26-1",
};

const MARCHE: MarcheAlerte = {
  uid: "m1", uids: ["m1"], nb_lots: 1, objet: "Nettoyage des gymnases", acheteur: "21690123100011", acheteur_nom: "Commune de Test",
  montant: 50000, date_fin_estimee: "2027-06-30", titulaire: "PROPRETE SA",
};

const GAIN: Gain = {
  source: "avis", uid: "boamp-26-9", uids: ["boamp-26-9"], nb_lots: 1, siren: "333333333", entreprise: "PROPRETE SA",
  objet: "Nettoyage de la mairie", acheteur_siret: "21690123100011", acheteur_nom: "Commune de Test", montant: 42000,
  date: "2026-10-01", url: "https://www.boamp.fr/pages/avis/?q=idweb:26-9",
};

describe("courriel d'alerte", () => {
  it("annonce ce qu'il y a de nouveau, avec les liens et la désinscription", () => {
    const courriel = composerAlerte(DESTINATAIRE, [AVIS], [MARCHE], [], "https://exemple.fr");
    expect(courriel.a).toBe("clo@exemple.fr");
    expect(courriel.sujet).toBe("1 appel d'offres et 1 marché à reconquérir");
    expect(courriel.texte).toContain("Nettoyage des écoles");
    expect(courriel.texte).toContain("Ville de Test · dép. 69 · réponse avant le 02/11/2026");
    expect(courriel.texte).toContain(
      `fin estimée juin 2027 · Commune de Test · ${euros(50000)} · titulaire actuel : PROPRETE SA`,
    );
    expect(courriel.texte).toContain("https://exemple.fr/acheteurs/21690123100011");
    expect(courriel.texte).toContain("https://exemple.fr/desinscription?jeton=abc123");
    expect(courriel.html).toContain('<a href="https://www.boamp.fr/pages/avis/?q=idweb:26-1">Nettoyage des écoles</a>');
  });

  it("regroupe les lots d'un même marché en une ligne", () => {
    const courriel = composerAlerte(
      DESTINATAIRE, [], [{ ...MARCHE, uids: ["m1", "m2", "m3"], nb_lots: 3, montant: 150000 }], [], "https://exemple.fr",
    );
    expect(courriel.texte).toContain(`3 lots · ${euros(150000)} au total`);
  });

  it("accorde le sujet et n'affiche que la section qui a du contenu", () => {
    const deuxAvis = composerAlerte(DESTINATAIRE, [AVIS, { ...AVIS, uid: "boamp-26-2" }], [], [], "https://exemple.fr");
    expect(deuxAvis.sujet).toBe("2 appels d'offres");
    expect(deuxAvis.texte).not.toContain("Marchés qui arrivent à échéance");
    const marches = composerAlerte(DESTINATAIRE, [], [MARCHE, { ...MARCHE, uid: "m2" }], [], "https://exemple.fr");
    expect(marches.sujet).toBe("2 marchés à reconquérir");
    expect(marches.texte).not.toContain("Appels d'offres qui viennent de paraître");
  });

  it("échappe le HTML des objets et renvoie vers la veille quand le compte n'a pas de jeton", () => {
    const courriel = composerAlerte(
      { ...DESTINATAIRE, jeton: null },
      [{ ...AVIS, objet: 'Fourniture de <script>"papier"' }],
      [],
      [],
      "https://exemple.fr",
    );
    expect(courriel.html).toContain("Fourniture de &lt;script&gt;&quot;papier&quot;");
    expect(courriel.html).not.toContain("<script>");
    expect(courriel.texte).toContain("https://exemple.fr/veille");
  });

  it("annonce les marchés gagnés par les concurrents suivis", () => {
    const courriel = composerAlerte(
      DESTINATAIRE, [AVIS], [MARCHE],
      [GAIN, { ...GAIN, source: "marche", uid: "m9", uids: ["m9", "m10"], nb_lots: 2, url: null, date: "2026-08-14" }],
      "https://exemple.fr",
    );
    expect(courriel.sujet).toBe("1 appel d'offres, 1 marché à reconquérir et 2 marchés gagnés par vos concurrents");
    expect(courriel.texte).toContain("Ce que vos concurrents viennent de gagner");
    expect(courriel.texte).toContain("PROPRETE SA : Nettoyage de la mairie");
    expect(courriel.texte).toContain(`attribution publiée le 01/10/2026 · Commune de Test · ${euros(42000)}`);
    // un marché connu par les DECP n'a pas d'avis : le lien mène à la fiche de l'entreprise
    expect(courriel.texte).toContain(`notifié le 14/08/2026 · Commune de Test · 2 lots · ${euros(42000)} au total`);
    expect(courriel.texte).toContain("https://exemple.fr/entreprises/333333333");
    const seul = composerAlerte(DESTINATAIRE, [], [], [GAIN], "https://exemple.fr");
    expect(seul.sujet).toBe("1 marché gagné par vos concurrents");
    expect(seul.texte).not.toContain("Appels d'offres qui viennent de paraître");
  });
});
