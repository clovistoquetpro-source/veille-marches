/**
 * Mots de passe : on ne garde qu'une empreinte PBKDF2 salée, jamais le mot de passe lui-même.
 * Web Crypto existe à l'identique dans Node et dans Cloudflare Workers, qui plafonne PBKDF2 à
 * 100 000 itérations.
 */

const ITERATIONS = 100_000;
const PREFIXE = "pbkdf2-sha256";

export const LONGUEUR_MIN = 8;
const LONGUEUR_MAX = 200;

/** Message d'erreur si le mot de passe ne convient pas, sinon null. */
export function motDePasseRefuse(motDePasse: string): string | null {
  if (motDePasse.length < LONGUEUR_MIN) return `Choisissez un mot de passe d'au moins ${LONGUEUR_MIN} caractères.`;
  if (motDePasse.length > LONGUEUR_MAX) return `Choisissez un mot de passe de moins de ${LONGUEUR_MAX} caractères.`;
  return null;
}

function versBase64(octets: Uint8Array): string {
  return btoa(String.fromCharCode(...octets));
}

function depuisBase64(texte: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
}

async function deriver(motDePasse: string, sel: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(motDePasse), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel, iterations }, cle, 256);
  return new Uint8Array(bits);
}

/** Empreinte à enregistrer : « pbkdf2-sha256$itérations$sel$empreinte ». */
export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const empreinte = await deriver(motDePasse, sel, ITERATIONS);
  return [PREFIXE, ITERATIONS, versBase64(sel), versBase64(empreinte)].join("$");
}

/** Vrai si le mot de passe correspond à l'empreinte enregistrée. */
export async function verifierMotDePasse(motDePasse: string, enregistre: string): Promise<boolean> {
  const [prefixe, iterations, sel, attendue] = enregistre.split("$");
  const n = Number(iterations);
  if (prefixe !== PREFIXE || !Number.isInteger(n) || n < 1 || n > ITERATIONS || !sel || !attendue) return false;
  const obtenue = await deriver(motDePasse, depuisBase64(sel), n);
  const reference = depuisBase64(attendue);
  if (obtenue.length !== reference.length) return false;
  // comparaison en temps constant : la durée ne dit pas combien d'octets sont justes
  let difference = 0;
  for (let i = 0; i < obtenue.length; i++) difference |= obtenue[i] ^ reference[i];
  return difference === 0;
}

/** Empreinte de comparaison quand le compte n'existe pas : la réponse prend le même temps. */
export const EMPREINTE_FACTICE = `${PREFIXE}$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;
