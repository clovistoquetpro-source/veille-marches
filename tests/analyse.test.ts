import { afterEach, describe, expect, it, vi } from "vitest";
import { analyserDossier, consigneAnalyse, SCHEMA_ANALYSE } from "../src/lib/analyse";
import type { AvisCandidature, Candidat } from "../src/lib/candidature";
import { deposerFichier, demanderJson } from "../src/lib/claude";

afterEach(() => vi.unstubAllGlobals());

const AVIS: AvisCandidature = {
  uid: "boamp-26-1", source: "boamp", numero: "26-1", type: "marche", objet: "Entretien des espaces verts",
  acheteur_nom: "Ville de Bourg", acheteur_siret: null, famille: "services",
  date_publication: "2026-10-02", date_limite: "2026-11-04", url: "https://www.boamp.fr/avis/detail/26-1",
};

const CANDIDAT: Candidat = {
  siren: "111111111", siret: "11111111100011", denomination: "JARDINS DE L'AIN", enseigne: null, adresse: "1 RUE VERTE 01000 BOURG",
  adresse_siege: null, forme_juridique: "SARL", pme: true, naf: "81.30Z", naf_libelle: "Services d'aménagement paysager",
  effectif: "10 à 19 salariés", date_creation: "2010-01-01", chiffres_affaires: [{ annee: "2024", ca: 850_000 }],
  email: "contact@jardins.fr", telephone: null, origine: "annuaire",
};

function reponseClaude(corps: object, status = 200) {
  const appel = vi.fn().mockResolvedValue(new Response(JSON.stringify(corps), { status }));
  vi.stubGlobal("fetch", appel);
  return appel;
}

describe("analyse d'un dossier par l'IA", () => {
  it("envoie les PDF déposés et ce qu'on sait de l'entreprise, et lit le verdict", async () => {
    const resultat = { verdict: "y_aller", resume: "Bon marché pour vous." };
    const appel = reponseClaude({
      stop_reason: "end_turn", usage: { input_tokens: 90_000, output_tokens: 2_500 },
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(resultat) }],
    });
    const analyse = await analyserDossier({
      cle: "cle", avis: AVIS, candidat: CANDIDAT, profil: null, modele: "claude-sonnet-5-5",
      fichiers: [{ fichier_id: "file_rc", nom: "RC.pdf" }, { fichier_id: "file_cctp", nom: "CCTP.pdf" }],
    });
    expect(analyse).toEqual({ donnees: resultat, consommation: { entree: 90_000, sortie: 2_500 }, modele: "claude-sonnet-5-5" });
    const requete = JSON.parse(appel.mock.calls[0][1].body);
    expect(requete.output_config).toEqual({ format: { type: "json_schema", schema: SCHEMA_ANALYSE }, effort: "medium" });
    const [rc, cctp, consigne] = requete.messages[0].content;
    expect(rc).toEqual({ type: "document", source: { type: "file", file_id: "file_rc" }, title: "RC.pdf" });
    expect(cctp.source.file_id).toBe("file_cctp");
    expect(consigne.text).toContain("Entretien des espaces verts");
    expect(consigne.text).toContain("Chiffre d'affaires : 2024 : 850");
  });

  it("ne rend rien quand l'IA refuse, coupe sa réponse ou que l'API échoue", async () => {
    const question = { cle: "cle", modele: "m", contenu: "?", schema: {}, maxTokens: 10, delai: 1000 };
    reponseClaude({ stop_reason: "refusal", content: [] });
    expect(await demanderJson(question)).toBeNull();
    reponseClaude({ stop_reason: "max_tokens", content: [{ type: "text", text: "{\"verd" }] });
    expect(await demanderJson(question)).toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => {});
    reponseClaude({ error: { message: "trop de pages" } }, 400);
    expect(await demanderJson(question)).toBeNull();
  });

  it("transmet le fichier tel quel à l'API Files", async () => {
    const appel = reponseClaude({ id: "file_1", filename: "RC.pdf", size_bytes: 1234, mime_type: "application/pdf" });
    const corps = new Blob(["--x\r\n...\r\n--x--"]);
    expect(await deposerFichier("cle", corps, "multipart/form-data; boundary=x")).toEqual(
      { id: "file_1", nom: "RC.pdf", taille: 1234, type: "application/pdf" },
    );
    const [adresse, options] = appel.mock.calls[0];
    expect(adresse).toBe("https://api.anthropic.com/v1/files");
    expect(options.body).toBe(corps);
    expect(options.headers).toMatchObject({ "content-type": "multipart/form-data; boundary=x", "x-api-key": "cle" });
  });

  it("rappelle à l'IA de ne rien inventer et de citer le dossier", () => {
    const texte = consigneAnalyse(AVIS, { ...CANDIDAT, chiffres_affaires: [] }, { cpv: ["77310"], mots_cles: ["espaces verts"], departements: [], origine: "manuel" });
    expect(texte).toContain("n'invente rien");
    expect(texte).toContain("Chiffre d'affaires : non publié");
    expect(texte).toContain("espaces verts, CPV 77310");
  });
});
