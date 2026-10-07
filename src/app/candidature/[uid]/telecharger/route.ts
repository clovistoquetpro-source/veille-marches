import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { avisPourCandidature, candidatDuCompte, composerDC1, composerDC2, lireLots, nomDeFichier, VERSION_DC1, VERSION_DC2 } from "@/lib/candidature";
import { compteDeLaSession, COOKIE_SESSION } from "@/lib/comptes";
import { db } from "@/lib/db";
import { documentWord } from "@/lib/docx";

export const dynamic = "force-dynamic";

/** Télécharge le DC1 ou le DC2 pré-rempli pour l'avis et l'entreprise du client connecté. */
export async function GET(requete: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const champs = requete.nextUrl.searchParams;
  const formulaire = champs.get("formulaire") === "dc2" ? "dc2" : "dc1";
  const sql = db();
  if (!sql) return new NextResponse("Base de données non configurée.", { status: 503 });
  const session = (await cookies()).get(COOKIE_SESSION)?.value;
  const donnees = await (async () => {
    const compte = await compteDeLaSession(sql, session);
    if (!compte) return "connexion" as const;
    const avis = await avisPourCandidature(sql, uid);
    if (!avis) return null;
    const candidat = await candidatDuCompte(sql, compte, {
      telephone: champs.get("telephone")?.slice(0, 100),
      email: champs.get("email")?.slice(0, 200),
    });
    return { avis, candidat };
  })().finally(() => sql.end());
  if (donnees === "connexion") return NextResponse.redirect(new URL("/connexion", requete.url));
  if (!donnees) return new NextResponse("Avis introuvable.", { status: 404 });

  const { avis, candidat } = donnees;
  const lots = lireLots(champs.get("lots"), champs.get("numeros"));
  const fichier = formulaire === "dc1"
    ? documentWord(composerDC1(avis, candidat, lots), `DC1 – Lettre de candidature (modèle du ${VERSION_DC1}) – ${avis.numero}`)
    : documentWord(composerDC2(avis, candidat, lots), `DC2 – Déclaration du candidat (modèle du ${VERSION_DC2}) – ${avis.numero}`);
  return new NextResponse(new Uint8Array(fichier), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${nomDeFichier(formulaire, avis)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
