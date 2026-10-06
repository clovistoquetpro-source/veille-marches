/**
 * Départements d'exécution, déduits d'un code postal (BOAMP, adresse de l'acheteur) ou d'un code
 * NUTS (lieu d'exécution des avis européens).
 */

/** Codes NUTS 3 (version 2021) des départements. */
const NUTS3: Record<string, string> = {
  FR101: "75", FR102: "77", FR103: "78", FR104: "91", FR105: "92", FR106: "93", FR107: "94", FR108: "95",
  FRB01: "18", FRB02: "28", FRB03: "36", FRB04: "37", FRB05: "41", FRB06: "45",
  FRC11: "21", FRC12: "58", FRC13: "71", FRC14: "89", FRC21: "25", FRC22: "39", FRC23: "70", FRC24: "90",
  FRD11: "14", FRD12: "50", FRD13: "61", FRD21: "27", FRD22: "76",
  FRE11: "59", FRE12: "62", FRE21: "02", FRE22: "60", FRE23: "80",
  FRF11: "67", FRF12: "68", FRF21: "08", FRF22: "10", FRF23: "51", FRF24: "52",
  FRF31: "54", FRF32: "55", FRF33: "57", FRF34: "88",
  FRG01: "44", FRG02: "49", FRG03: "53", FRG04: "72", FRG05: "85",
  FRH01: "22", FRH02: "29", FRH03: "35", FRH04: "56",
  FRI11: "24", FRI12: "33", FRI13: "40", FRI14: "47", FRI15: "64",
  FRI21: "19", FRI22: "23", FRI23: "87", FRI31: "16", FRI32: "17", FRI33: "79", FRI34: "86",
  FRJ11: "11", FRJ12: "30", FRJ13: "34", FRJ14: "48", FRJ15: "66",
  FRJ21: "09", FRJ22: "12", FRJ23: "31", FRJ24: "32", FRJ25: "46", FRJ26: "65", FRJ27: "81", FRJ28: "82",
  FRK11: "03", FRK12: "15", FRK13: "43", FRK14: "63",
  FRK21: "01", FRK22: "07", FRK23: "26", FRK24: "38", FRK25: "42", FRK26: "69", FRK27: "73", FRK28: "74",
  FRL01: "04", FRL02: "05", FRL03: "06", FRL04: "13", FRL05: "83", FRL06: "84",
  FRM01: "2A", FRM02: "2B",
  FRY10: "971", FRY20: "972", FRY30: "973", FRY40: "974", FRY50: "976",
};

/**
 * Départements couverts par un code NUTS. Un code de région (« FRK2 ») couvre tous ses départements ;
 * « FR » seul ou un code inconnu ne donne rien.
 */
export function departementsDuNuts(code: string): string[] {
  const nuts = code.trim().toUpperCase();
  if (nuts.length < 3 || !nuts.startsWith("FR")) return [];
  return Object.entries(NUTS3)
    .filter(([cle]) => cle.startsWith(nuts))
    .map(([, departement]) => departement);
}

/**
 * Département d'un code postal français, éventuellement suivi de « Cedex ». Corse : 200xx-201xx pour la
 * Corse-du-Sud, au-delà la Haute-Corse.
 */
export function departementDuCodePostal(codePostal: string): string | null {
  const cp = /^\s*(\d{5})\b/.exec(codePostal)?.[1];
  if (!cp) return null;
  if (/^9[78]/.test(cp)) return cp.slice(0, 3);
  if (cp.startsWith("20")) return Number(cp) < 20200 ? "2A" : "2B";
  if (cp === "00000") return null;
  return cp.slice(0, 2);
}

/**
 * Code département tel que publié par le BOAMP (« 6 », « 06 », « 2A », « 971 »), ou saisi par un
 * client. « 20 » (la Corse avant 1976) et les codes qui ne désignent aucun département sont écartés.
 */
export function normaliserDepartement(code: string): string | null {
  const d = code.trim().toUpperCase();
  const deux = /^\d$/.test(d) ? `0${d}` : d;
  if (/^(0[1-9]|[1-8]\d|9[0-5]|2A|2B|9[78]\d)$/.test(deux) && deux !== "20") return deux;
  return null;
}
