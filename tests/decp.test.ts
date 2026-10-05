import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { beforeAll, describe, expect, it } from "vitest";
import { normaliser } from "../src/ingest/decp";

type Ligne = Partial<{
  id: string; acheteur_id: string; acheteur_nom: string; objet: string; codecpv: string;
  montant: number; datenotification: string; dureemois: number; offresrecues: string;
  lieu: string; typelieu: string;
  titulaire_id_1: string; titulaire_typeidentifiant_1: string;
  titulaire_id_2: string; titulaire_typeidentifiant_2: string;
}>;

const ACHETEUR = "21690123100011";

function valeurs(lignes: Ligne[], avecNom: boolean): string {
  const v = (x: unknown) => (x === undefined ? "null" : typeof x === "number" ? String(x) : `'${x}'`);
  return lignes
    .map((l) => `(${[
      l.id, l.acheteur_id ?? ACHETEUR, l.objet ?? "Objet", l.codecpv, "Marché", "Procédure adaptée",
      l.montant ?? 100000, l.datenotification, l.dureemois, l.offresrecues, l.lieu ?? "69",
      l.typelieu ?? "Code département", "test",
      l.titulaire_id_1, l.titulaire_typeidentifiant_1, l.titulaire_id_2, l.titulaire_typeidentifiant_2,
      undefined, undefined, ...(avecNom ? [l.acheteur_nom] : []),
    ].map(v).join(", ")})`)
    .join(",\n");
}

async function creerSource(con: DuckDBConnection, table: string, lignes: Ligne[], avecNom: boolean) {
  const colonnes = [
    "id", "acheteur_id", "objet", "codecpv", "nature", "procedure", "montant", "datenotification",
    "dureemois", "offresrecues", "lieuexecution_code", "lieuexecution_typecode", "source", "titulaire_id_1",
    "titulaire_typeidentifiant_1", "titulaire_id_2", "titulaire_typeidentifiant_2",
    "titulaire_id_3", "titulaire_typeidentifiant_3", ...(avecNom ? ["acheteur_nom"] : []),
  ];
  await con.run(`create table ${table} as select * from (values ${valeurs(lignes, avecNom)}) t(${colonnes.join(", ")})`);
}

let con: DuckDBConnection;

async function lignes<T>(requete: string): Promise<T[]> {
  return (await con.runAndReadAll(requete)).getRowObjectsJson() as T[];
}

beforeAll(async () => {
  con = await (await DuckDBInstance.create(":memory:")).connect();
  await creerSource(con, "src_2019", [
    // SIRET stocké comme nombre : zéro de tête perdu
    { id: "A1", codecpv: "50000000-5", datenotification: "2021-01-31", dureemois: 13, titulaire_id_1: "5820378000031", titulaire_typeidentifiant_1: "SIRET", acheteur_nom: "Ville de Test" },
    // même marché republié plus tard : doit être dédoublonné
    { id: "A1", codecpv: "50000000-5", datenotification: "2021-03-01", dureemois: 13, titulaire_id_1: "5820378000031", titulaire_typeidentifiant_1: "SIRET" },
    { id: "T1", lieu: "20090", typelieu: "CODE POSTAL", codecpv: "45210000-2", datenotification: "2022-06-15", dureemois: 24, titulaire_id_1: "12345678900011", titulaire_typeidentifiant_1: "SIRET" },
    { id: "M1", lieu: "97411", typelieu: "Code commune", codecpv: "71200000-0", datenotification: "2022-06-15", dureemois: 24, titulaire_id_1: "12345678900011", titulaire_typeidentifiant_1: "SIRET" },
    { id: "D100", codecpv: "60100000-9", datenotification: "2023-05-10", dureemois: 24, montant: 70000, titulaire_id_1: "5820378000031", titulaire_typeidentifiant_1: "SIRET" },
    // acheteur invalide : ignoré
    { id: "X1", acheteur_id: "123", codecpv: "50000000-5", datenotification: "2022-01-01", dureemois: 12 },
  ], true);
  await creerSource(con, "src_2022", [
    { id: "F1", lieu: "35580", typelieu: "Code postal", codecpv: "33140000-3", datenotification: "2025-02-28", dureemois: 48, offresrecues: "3",
      titulaire_id_1: "11111111100011", titulaire_typeidentifiant_1: "SIRET",
      titulaire_id_2: "11111111100011", titulaire_typeidentifiant_2: "SIRET" },
    { id: "S1", lieu: "84", typelieu: "Code région", codecpv: "90910000-9", datenotification: "2025-03-01", dureemois: 0, offresrecues: "0",
      titulaire_id_1: "22222222200022", titulaire_typeidentifiant_1: "SIRET",
      titulaire_id_2: "BE0123456789", titulaire_typeidentifiant_2: "TVA" },
    // même marché que D100 (ancien format) transmis sous un autre identifiant : on garde celui-ci
    { id: "D1", codecpv: "60100000-9", datenotification: "2023-05-10", dureemois: 24, montant: 70000, titulaire_id_1: "05820378000031", titulaire_typeidentifiant_1: "SIRET" },
    { id: "C1", codecpv: "90910000-9", datenotification: "2025-03-01", dureemois: 12,
      titulaire_id_1: "33333333300033", titulaire_typeidentifiant_1: "SIRET",
      titulaire_id_2: "CDL", titulaire_typeidentifiant_2: "CDL" },
  ], false);
  await normaliser(con, { "2019": "src_2019", "2022": "src_2022" });
});

describe("normaliser les DECP", () => {
  it("garde une ligne par marché, y compris publié dans les deux formats, et écarte les acheteurs invalides", async () => {
    const marches = await lignes<{ uid: string }>("select uid from marches_norm order by uid");
    expect(marches.map((m) => m.uid)).toEqual([
      `${ACHETEUR}-A1`, `${ACHETEUR}-C1`, `${ACHETEUR}-D1`, `${ACHETEUR}-F1`, `${ACHETEUR}-M1`, `${ACHETEUR}-S1`, `${ACHETEUR}-T1`,
    ]);
    const [a1] = await lignes<{ date_notification: string }>(
      `select date_notification::varchar as date_notification from marches_norm where id_marche = 'A1'`,
    );
    expect(a1.date_notification).toBe("2021-01-31");
  });

  it("classe les familles et exclut travaux et maîtrise d'œuvre des renouvellements", async () => {
    const familles = await lignes<{ id_marche: string; famille: string; renouvelable: boolean }>(
      "select id_marche, famille, renouvelable from marches_norm order by id_marche",
    );
    expect(familles).toEqual([
      { id_marche: "A1", famille: "services", renouvelable: true },
      { id_marche: "C1", famille: "services", renouvelable: true },
      { id_marche: "D1", famille: "services", renouvelable: true },
      { id_marche: "F1", famille: "fournitures", renouvelable: true },
      { id_marche: "M1", famille: "services", renouvelable: false },
      { id_marche: "S1", famille: "services", renouvelable: true },
      { id_marche: "T1", famille: "travaux", renouvelable: false },
    ]);
  });

  it("calcule la date de fin en restant sur le dernier jour du mois", async () => {
    const fins = await lignes<{ id_marche: string; fin: string | null; duree_mois: number | null }>(
      "select id_marche, date_fin_estimee::varchar as fin, duree_mois from marches_norm order by id_marche",
    );
    expect(fins.find((f) => f.id_marche === "A1")?.fin).toBe("2022-02-28");
    expect(fins.find((f) => f.id_marche === "F1")?.fin).toBe("2029-02-28");
    // durée nulle : pas de date de fin
    expect(fins.find((f) => f.id_marche === "S1")).toMatchObject({ fin: null, duree_mois: null });
  });

  it("déduit le département du code postal, de la commune ou du département", async () => {
    const departements = await lignes<{ id_marche: string; departement: string | null }>(
      "select id_marche, departement from marches_norm order by id_marche",
    );
    expect(departements).toEqual([
      { id_marche: "A1", departement: "69" },
      { id_marche: "C1", departement: "69" },
      { id_marche: "D1", departement: "69" },
      { id_marche: "F1", departement: "35" },
      { id_marche: "M1", departement: "974" },
      { id_marche: "S1", departement: null },
      { id_marche: "T1", departement: "2A" },
    ]);
  });

  it("convertit le nombre d'offres et ignore les zéros", async () => {
    const offres = await lignes<{ id_marche: string; offres_recues: number | null }>(
      "select id_marche, offres_recues from marches_norm where format = '2022' order by id_marche",
    );
    expect(offres).toEqual([
      { id_marche: "C1", offres_recues: null },
      { id_marche: "D1", offres_recues: null },
      { id_marche: "F1", offres_recues: 3 },
      { id_marche: "S1", offres_recues: null },
    ]);
  });

  it("restaure les zéros de tête des SIRET, ignore « CDL » et dédoublonne les titulaires", async () => {
    const titulaires = await lignes<{ marche_uid: string; titulaire_id: string }>(
      "select marche_uid, titulaire_id from titulaires_norm order by marche_uid, titulaire_id",
    );
    expect(titulaires).toEqual([
      { marche_uid: `${ACHETEUR}-A1`, titulaire_id: "05820378000031" },
      { marche_uid: `${ACHETEUR}-C1`, titulaire_id: "33333333300033" },
      { marche_uid: `${ACHETEUR}-D1`, titulaire_id: "05820378000031" },
      { marche_uid: `${ACHETEUR}-F1`, titulaire_id: "11111111100011" },
      { marche_uid: `${ACHETEUR}-M1`, titulaire_id: "12345678900011" },
      { marche_uid: `${ACHETEUR}-S1`, titulaire_id: "22222222200022" },
      { marche_uid: `${ACHETEUR}-S1`, titulaire_id: "BE0123456789" },
      { marche_uid: `${ACHETEUR}-T1`, titulaire_id: "12345678900011" },
    ]);
  });
});
