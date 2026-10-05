import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAvecReprises } from "../src/ingest/telechargement";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("appels aux API publiques", () => {
  it("réessaie après une indisponibilité passagère ou une coupure réseau", async () => {
    vi.useFakeTimers();
    const appels = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", appels);
    const reponse = fetchAvecReprises("https://exemple.test");
    await vi.runAllTimersAsync();
    expect(await (await reponse).text()).toBe("ok");
    expect(appels).toHaveBeenCalledTimes(3);
  });

  it("renvoie aussitôt une erreur de la requête, et la dernière réponse quand les essais sont épuisés", async () => {
    vi.useFakeTimers();
    const introuvable = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", introuvable);
    expect((await fetchAvecReprises("https://exemple.test")).status).toBe(404);
    expect(introuvable).toHaveBeenCalledTimes(1);

    const indisponible = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", indisponible);
    const reponse = fetchAvecReprises("https://exemple.test", {}, 3);
    await vi.runAllTimersAsync();
    expect((await reponse).status).toBe(503);
    expect(indisponible).toHaveBeenCalledTimes(3);
  });
});
