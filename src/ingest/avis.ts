/**
 * Avis publiés : format commun aux deux sources et enregistrement en base.
 * Le BOAMP fournit les avis nationaux (MAPA, procédures formalisées sous les seuils), TED les avis
 * européens : les avis européens repris par le BOAMP (famille « JOUE ») sont tous sur TED, on les y
 * prend pour ne pas les compter deux fois.
 */
import type postgres from "postgres";
import { tableauPg } from "../lib/pg";

export type TypeAvis =
  | "marche" | "attribution" | "preinformation" | "rectificatif" | "annulation" | "modification" | "autre";

export type Famille = "travaux" | "fournitures" | "services";

export type Titulaire = { nom: string | null; identifiant: string | null };

export type Avis = {
  uid: string;
  source: "boamp" | "ted";
  numero: string;
  type: TypeAvis;
  objet: string;
  acheteur_nom: string | null;
  acheteur_siret: string | null;
  cpv: string | null;
  famille: Famille | null;
  descripteurs: string[] | null;
  departements: string[];
  date_publication: string;
  date_limite: string | null;
  montant: number | null;
  offres_recues: number | null;
  url: string;
  avis_initial: string | null;
  titulaires: Titulaire[];
};

/** Même classement que les DECP : travaux (CPV 45), fournitures (CPV 03 à 44), services (le reste). */
export function familleDuCpv(cpv: string | null): Famille | null {
  if (!cpv || !/^\d{2}/.test(cpv)) return null;
  const division = cpv.slice(0, 2);
  if (division === "45") return "travaux";
  if (division >= "03" && division <= "44") return "fournitures";
  return "services";
}

/** SIRET (14 chiffres) ou SIREN (9 chiffres), y compris un numéro de TVA français ; sinon null. */
export function identifiantEntreprise(brut: string | null | undefined): string | null {
  if (!brut) return null;
  const chiffres = brut.replace(/[\s.\-]/g, "");
  if (/^0+$/.test(chiffres)) return null;
  if (/^\d{14}$/.test(chiffres) || /^\d{9}$/.test(chiffres)) return chiffres;
  const tva = /^FR[0-9A-Z]{2}(\d{9})$/i.exec(chiffres);
  return tva ? tva[1] : null;
}

/** SIRET à 14 chiffres, sinon null. */
export function siret(brut: string | null | undefined): string | null {
  const id = identifiantEntreprise(brut);
  return id?.length === 14 ? id : null;
}

/** Enlève les doublons (même identifiant, ou même nom sans identifiant). */
export function dedoublonnerTitulaires(titulaires: Titulaire[]): Titulaire[] {
  const vus = new Set<string>();
  return titulaires.filter((t) => {
    const cle = t.identifiant ?? t.nom?.trim().toLowerCase();
    if (!cle || vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

/** Insère ou met à jour les avis et remplace leurs titulaires. Renvoie le nombre d'avis traités. */
export async function enregistrerAvis(sql: postgres.Sql, avis: Avis[]): Promise<number> {
  if (avis.length === 0) return 0;
  await sql.begin(async (tx) => {
    for (let debut = 0; debut < avis.length; debut += 500) {
      const lot = avis.slice(debut, debut + 500);
      const lignes = lot.map(({ titulaires, ...a }) => ({
        ...a,
        descripteurs: a.descripteurs ? tableauPg(a.descripteurs) : null,
        departements: tableauPg(a.departements),
      }));
      await tx`
        insert into avis ${tx(lignes)}
        on conflict (uid) do update set
          type = excluded.type, objet = excluded.objet, acheteur_nom = excluded.acheteur_nom,
          acheteur_siret = excluded.acheteur_siret, cpv = excluded.cpv, famille = excluded.famille,
          descripteurs = excluded.descripteurs, departements = excluded.departements,
          date_publication = excluded.date_publication, date_limite = excluded.date_limite,
          montant = excluded.montant, offres_recues = excluded.offres_recues, url = excluded.url,
          avis_initial = excluded.avis_initial, maj_le = now()`;
      const uids = lot.map((a) => a.uid);
      await tx`delete from avis_titulaires where avis_uid in ${tx(uids)}`;
      const titulaires = lot.flatMap((a) =>
        a.titulaires.map((t, rang) => ({ avis_uid: a.uid, rang, nom: t.nom, identifiant: t.identifiant })),
      );
      if (titulaires.length > 0) await tx`insert into avis_titulaires ${tx(titulaires)}`;
    }
  });
  return avis.length;
}
