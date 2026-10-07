import { afterEach, describe, expect, it, vi } from "vitest";
import { profilParIa } from "../src/lib/ia";

afterEach(() => vi.unstubAllGlobals());

function reponseOutil(input: unknown) {
  const appel = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    stop_reason: "end_turn",
    content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(input) }],
  })));
  vi.stubGlobal("fetch", appel);
  return appel;
}

const ENTREPRISE = { nom: "MENUISERIE DUPONT", naf_libelle: "Travaux de menuiserie bois et PVC" };

describe("profil déduit par l'IA", () => {
  it("retient les codes CPV et les mots-clés proposés", async () => {
    const appel = reponseOutil({ cpv: ["45421000-4", "44220000"], mots_cles: ["menuiserie", "Fenêtre"] });
    expect(await profilParIa(ENTREPRISE, "cle-de-test")).toEqual({
      cpv: ["45421000", "44220000"], mots_cles: ["menuiserie", "fenêtre"], departements: [], origine: "ia",
    });
    const requete = JSON.parse(appel.mock.calls[0][1].body);
    // les modèles récents refusent un appel d'outil forcé : on demande une réponse JSON
    expect(requete.tool_choice).toBeUndefined();
    expect(requete.output_config.format.type).toBe("json_schema");
    expect(requete.messages[0].content).toContain("Travaux de menuiserie bois et PVC");
  });

  it("n'appelle pas l'API sans clé", async () => {
    const appel = reponseOutil({ cpv: ["45"], mots_cles: [] });
    expect(await profilParIa(ENTREPRISE, undefined)).toBeNull();
    expect(appel).not.toHaveBeenCalled();
  });

  it("renvoie null quand la réponse est inutilisable ou que l'API échoue", async () => {
    reponseOutil({ cpv: ["x"], mots_cles: ["bois"] });
    expect((await profilParIa(ENTREPRISE, "cle-de-test"))).toEqual(
      { cpv: [], mots_cles: ["bois"], departements: [], origine: "ia" },
    );
    reponseOutil({ cpv: [], mots_cles: [] });
    expect(await profilParIa(ENTREPRISE, "cle-de-test")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    expect(await profilParIa(ENTREPRISE, "cle-de-test")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau")));
    expect(await profilParIa(ENTREPRISE, "cle-de-test")).toBeNull();
  });
});
