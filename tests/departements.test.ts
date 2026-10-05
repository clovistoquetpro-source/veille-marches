import { describe, expect, it } from "vitest";
import { departementDuCodePostal, departementsDuNuts, normaliserDepartement } from "../src/ingest/departements";

describe("départements", () => {
  it("lit un code NUTS de département ou de région", () => {
    expect(departementsDuNuts("FRK26")).toEqual(["69"]);
    expect(departementsDuNuts("frm01")).toEqual(["2A"]);
    expect(departementsDuNuts("FRY40")).toEqual(["974"]);
    expect(departementsDuNuts("FRK2")).toEqual(["01", "07", "26", "38", "42", "69", "73", "74"]);
    expect(departementsDuNuts("FR")).toEqual([]);
    expect(departementsDuNuts("FRZZZ")).toEqual([]);
    expect(departementsDuNuts("BE335")).toEqual([]);
  });

  it("lit un code postal, y compris Corse, outre-mer et Cedex", () => {
    expect(departementDuCodePostal("69003")).toBe("69");
    expect(departementDuCodePostal("01000")).toBe("01");
    expect(departementDuCodePostal("20090")).toBe("2A");
    expect(departementDuCodePostal("20200")).toBe("2B");
    expect(departementDuCodePostal("97411")).toBe("974");
    expect(departementDuCodePostal("94165 Cedex")).toBe("94");
    expect(departementDuCodePostal("7500")).toBeNull();
    expect(departementDuCodePostal("")).toBeNull();
  });

  it("normalise les codes du BOAMP", () => {
    expect(normaliserDepartement("6")).toBe("06");
    expect(normaliserDepartement("2a")).toBe("2A");
    expect(normaliserDepartement("971")).toBe("971");
    expect(normaliserDepartement("00")).toBeNull();
    expect(normaliserDepartement("FR")).toBeNull();
  });
});
