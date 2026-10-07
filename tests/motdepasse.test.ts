import { describe, expect, it } from "vitest";
import { EMPREINTE_FACTICE, hacherMotDePasse, motDePasseRefuse, verifierMotDePasse } from "../src/lib/motdepasse";

describe("mots de passe", () => {
  it("retrouve le bon mot de passe, et lui seul", async () => {
    const empreinte = await hacherMotDePasse("cheval-batterie-agrafe");
    expect(empreinte).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{44}$/);
    expect(await verifierMotDePasse("cheval-batterie-agrafe", empreinte)).toBe(true);
    expect(await verifierMotDePasse("Cheval-batterie-agrafe", empreinte)).toBe(false);
    expect(await verifierMotDePasse("", empreinte)).toBe(false);
  });

  it("sale chaque empreinte : deux comptes au même mot de passe n'ont pas la même", async () => {
    expect(await hacherMotDePasse("même mot de passe")).not.toBe(await hacherMotDePasse("même mot de passe"));
  });

  it("refuse les empreintes d'un autre format sans planter", async () => {
    expect(await verifierMotDePasse("x", "")).toBe(false);
    expect(await verifierMotDePasse("x", "md5$abc")).toBe(false);
    expect(await verifierMotDePasse("x", "pbkdf2-sha256$999999999$AAAA$AAAA")).toBe(false);
    expect(await verifierMotDePasse("", EMPREINTE_FACTICE)).toBe(false);
  });

  it("demande au moins 8 caractères", () => {
    expect(motDePasseRefuse("1234567")).toBe("Choisissez un mot de passe d'au moins 8 caractères.");
    expect(motDePasseRefuse("12345678")).toBeNull();
    expect(motDePasseRefuse("x".repeat(201))).toBe("Choisissez un mot de passe de moins de 200 caractères.");
  });
});
