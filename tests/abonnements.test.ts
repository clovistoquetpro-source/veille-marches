import { afterEach, describe, expect, it, vi } from "vitest";
import { type Abonnement, accesOuvert, joursDEssai } from "../src/lib/abonnements";
import { lireEvenementStripe } from "../src/lib/stripe";

const BASE: Abonnement = {
  compte_id: "c1", statut: "essai", fin_essai: null, client_stripe: null, abonnement_stripe: null,
  fin_periode: null,
};

function dansNJours(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe("accès au service", () => {
  it("ouvre l'accès pendant l'essai et tant que l'abonnement vit", () => {
    expect(accesOuvert({ ...BASE, fin_essai: dansNJours(3) })).toBe(true);
    expect(accesOuvert({ ...BASE, fin_essai: dansNJours(0) })).toBe(true);
    expect(accesOuvert({ ...BASE, statut: "actif" })).toBe(true);
    // un paiement en retard ne coupe pas tout de suite : on laisse le temps de changer de carte
    expect(accesOuvert({ ...BASE, statut: "en_retard" })).toBe(true);
  });

  it("ferme l'accès après l'essai, après résiliation, et sans abonnement du tout", () => {
    expect(accesOuvert({ ...BASE, fin_essai: dansNJours(-1) })).toBe(false);
    expect(accesOuvert({ ...BASE, statut: "resilie" })).toBe(false);
    expect(accesOuvert(null)).toBe(false);
  });

  it("compte les jours d'essai restants", () => {
    expect(joursDEssai({ ...BASE, fin_essai: dansNJours(7) })).toBe(7);
    expect(joursDEssai({ ...BASE, fin_essai: dansNJours(-3) })).toBe(0);
    expect(joursDEssai({ ...BASE, statut: "actif" })).toBeNull();
  });
});

const SECRET = "whsec_essai";

/** Signe un corps comme le fait Stripe. */
async function signer(corps: string, horodatage = Math.floor(Date.now() / 1000)): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${horodatage}.${corps}`));
  const hex = [...new Uint8Array(signature)].map((o) => o.toString(16).padStart(2, "0")).join("");
  return `t=${horodatage},v1=${hex}`;
}

afterEach(() => vi.useRealTimers());

describe("événements Stripe", () => {
  const paiement = JSON.stringify({
    type: "checkout.session.completed",
    data: { object: { client_reference_id: "compte-1", customer: "cus_1", subscription: "sub_1" } },
  });

  it("accepte un événement bien signé et en retient ce qui nous intéresse", async () => {
    expect(await lireEvenementStripe(paiement, await signer(paiement), SECRET)).toMatchObject({
      type: "checkout.session.completed", compte_id: "compte-1", client_stripe: "cus_1",
      abonnement_stripe: "sub_1", statut: "actif",
    });
  });

  it("lit l'état et la fin de période d'un abonnement, et retrouve le compte dans les métadonnées", async () => {
    const corps = JSON.stringify({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_2", customer: "cus_2", status: "past_due", current_period_end: 1800000000,
          metadata: { compte_id: "compte-2" },
        },
      },
    });
    expect(await lireEvenementStripe(corps, await signer(corps), SECRET)).toMatchObject({
      compte_id: "compte-2", abonnement_stripe: "sub_2", statut: "en_retard",
      fin_periode: new Date(1800000000 * 1000).toISOString(),
    });
    const resiliation = JSON.stringify({
      type: "customer.subscription.deleted", data: { object: { id: "sub_3", status: "canceled" } },
    });
    expect((await lireEvenementStripe(resiliation, await signer(resiliation), SECRET))?.statut).toBe("resilie");
  });

  it("refuse une signature fausse, absente, trop ancienne, ou sans secret", async () => {
    expect(await lireEvenementStripe(paiement, "t=1,v1=00", SECRET)).toBeNull();
    expect(await lireEvenementStripe(paiement, null, SECRET)).toBeNull();
    expect(await lireEvenementStripe(paiement, await signer(paiement), undefined)).toBeNull();
    const vieille = await signer(paiement, Math.floor(Date.now() / 1000) - 3600);
    expect(await lireEvenementStripe(paiement, vieille, SECRET)).toBeNull();
    // le même corps signé avec un autre secret ne passe pas
    const autre = await lireEvenementStripe(paiement, await signer(paiement), "whsec_autre");
    expect(autre).toBeNull();
  });
});
