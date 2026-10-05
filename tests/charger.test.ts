/**
 * Test d'intégration : migrations + chargement dans un vrai PostgreSQL.
 * Ne tourne que si DATABASE_URL_TEST pointe vers une base locale (la base est vidée).
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Avis, enregistrerAvis } from "../src/ingest/avis";
import { chargerDecp, journaliser, migrer } from "../src/ingest/charger";
import { exporterCsv, normaliser } from "../src/ingest/decp";
import { chargerEntreprises } from "../src/ingest/sirene";
import { ficheAcheteur } from "../src/lib/acheteurs";
import { listerAvis } from "../src/lib/avis";
import { ficheEntreprise } from "../src/lib/entreprises";
import { listerRenouvellements } from "../src/lib/renouvellements";

const url = process.env.DATABASE_URL_TEST;
const locale = url !== undefined && /@(localhost|127\.0\.0\.1)[:/]/.test(url);

describe.skipIf(!locale)("charger les DECP dans PostgreSQL", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    // mêmes options que le site (src/lib/db.ts) : sans fetch_types, les tableaux ne sont pas décodés
    sql = postgres(url!, { max: 1, onnotice: () => {}, fetch_types: false });
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrer(sql, path.join(process.cwd(), "db/migrations"));

    const aujourdhui = new Date();
    const ilYa = (mois: number) => {
      const d = new Date(aujourdhui);
      d.setMonth(d.getMonth() - mois);
      return d.toISOString().slice(0, 10);
    };
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    const colonnes = "id, acheteur_id, objet, codecpv, nature, procedure, montant, datenotification, dureemois, " +
      "offresrecues, lieuexecution_code, lieuexecution_typecode, source, titulaire_id_1, titulaire_typeidentifiant_1, titulaire_id_2, " +
      "titulaire_typeidentifiant_2, titulaire_id_3, titulaire_typeidentifiant_3";
    // S1 se termine dans 6 mois (renouvellement) mais S3, du même type, vient d'être notifié : S1 est
    // probablement déjà relancé ; S3 finit dans 9 mois ; S2 est fini ; T1 sont des travaux.
    await con.run(`create table src_2022 as select * from (values
      ('S1', '21690123100011', 'Nettoyage', '90910000-9', 'Marché', 'MAPA', 50000, '${ilYa(42)}', 48, '2', '69', 'Code département', 'test', '11111111100011', 'SIRET', null, null, null, null),
      ('S2', '21690123100011', 'Repas', '55520000-1', 'Marché', 'MAPA', 80000, '${ilYa(30)}', 12, '1', '69', 'Code département', 'test', '22222222200022', 'SIRET', null, null, null, null),
      ('S3', '21690123100011', 'Nettoyage des écoles', '90910000-9', 'Marché', 'MAPA', 30000, '${ilYa(3)}', 12, '3', '69', 'Code département', 'test', '44444444400044', 'SIRET', null, null, null, null),
      ('T1', '21690123100011', 'Toiture', '45261000-4', 'Marché', 'MAPA', 90000, '${ilYa(42)}', 48, '4', '69', 'Code département', 'test', '33333333300033', 'SIRET', null, null, null, null)
    ) t(${colonnes})`);
    // S2 publié aussi dans l'ancien format sous un autre identifiant : doublon à écarter, mais il
    // apporte le nom de l'acheteur.
    await con.run(`create table src_2019 as select * replace (id || '00' as id), 'Ville de Test' as acheteur_nom
      from src_2022 where id = 'S2'`);
    await normaliser(con, { "2019": "src_2019", "2022": "src_2022" });
    const fichiers = await exporterCsv(con, await mkdtemp(path.join(tmpdir(), "decp-test-")));
    await journaliser(sql, "decp", () => chargerDecp(sql, fichiers));
    // Un second chargement remplace les données au lieu de les dupliquer.
    await chargerDecp(sql, fichiers);
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("charge les marchés, les titulaires et les acheteurs", async () => {
    const [compte] = await sql`select
      (select count(*)::int from marches) as marches,
      (select count(*)::int from marches_titulaires) as titulaires,
      (select count(*)::int from acheteurs) as acheteurs`;
    expect(compte).toEqual({ marches: 4, titulaires: 4, acheteurs: 1 });
    const [titulaire] = await sql`select siren from marches_titulaires where titulaire_id = '11111111100011'`;
    expect(titulaire.siren).toBe("111111111");
    await sql`insert into marches_titulaires (marche_uid, titulaire_id, type_identifiant)
      select uid, '444444444', 'SIRET' from marches where id_marche = 'S1'`;
    const [siren] = await sql`select siren from marches_titulaires where titulaire_id = '444444444'`;
    expect(siren.siren).toBe("444444444");
    await sql`delete from marches_titulaires where titulaire_id = '444444444'`;
  });

  it("liste seulement les services et fournitures qui finissent dans les 12 mois", async () => {
    const lignes = await sql`select id_marche, deja_relance_le is not null as deja_relance
      from renouvellements order by id_marche`;
    expect(lignes).toEqual([
      { id_marche: "S1", deja_relance: true },
      { id_marche: "S3", deja_relance: false },
    ]);
  });

  it("filtre les renouvellements par département et par code CPV", async () => {
    const [s1, s3] = await listerRenouvellements(sql, { departement: "69", cpv: "909" });
    expect(s1).toMatchObject({
      objet: "Nettoyage", acheteur_nom: "Ville de Test",
      titulaires: [{ id: "11111111100011", siren: "111111111", nom: null }],
    });
    expect(s1.deja_relance_le).not.toBeNull();
    expect(s3).toMatchObject({ objet: "Nettoyage des écoles", deja_relance_le: null });
    expect(await listerRenouvellements(sql, { departement: "75" })).toEqual([]);
    expect(await listerRenouvellements(sql, { cpv: "55" })).toEqual([]);
  });

  it("journalise l'import", async () => {
    const [imp] = await sql`select statut, lignes from imports order by id desc limit 1`;
    expect(imp).toEqual({ statut: "ok", lignes: 4 });
  });

  it("ne réapplique pas une migration déjà passée", async () => {
    expect(await migrer(sql, path.join(process.cwd(), "db/migrations"))).toEqual([]);
  });
});

/** Suite de la précédente : avis, entreprises et fiches, sur les marchés déjà chargés. */
describe.skipIf(!locale)("avis, entreprises et fiches", () => {
  let sql: postgres.Sql;
  const ACHETEUR = "21690123100011";

  const avis = (champs: Partial<Avis>): Avis => ({
    uid: "boamp-26-1", source: "boamp", numero: "26-1", type: "marche", objet: "Nettoyage des écoles",
    acheteur_nom: "Ville de Test", acheteur_siret: ACHETEUR, cpv: "90910000", famille: "services",
    descripteurs: ["Nettoyage", "Propreté \"urbaine\""], departements: ["69"], date_publication: "2026-10-01",
    date_limite: "2026-11-02", montant: null, offres_recues: null, url: "https://www.boamp.fr/pages/avis/?q=idweb:26-1",
    avis_initial: null, titulaires: [],
    ...champs,
  });

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, onnotice: () => {}, fetch_types: false });
    const csv = path.join(await mkdtemp(path.join(tmpdir(), "entreprises-test-")), "entreprises.csv");
    await writeFile(csv, [
      "siren,nom,sigle,categorie_juridique,naf,tranche_effectif,categorie,date_creation,active,diffusible",
      "111111111,NETTOYAGE DU RHONE,,5710,81.21Z,12,PME,2005-03-01,true,true",
      "216901231,COMMUNE DE TEST,,7210,84.11Z,,,1950-01-01,true,true",
      "222222222,,,1000,56.10A,,PME,2015-01-01,true,false",
    ].join("\n") + "\n");
    expect(await chargerEntreprises(sql, csv)).toBe(3);

    const premier = [
      avis({}),
      avis({
        uid: "ted-1-2026", source: "ted", numero: "1-2026", type: "attribution", objet: "Nettoyage des gymnases",
        descripteurs: null, date_publication: "2026-09-30", date_limite: null, montant: 45000,
        url: "https://ted.europa.eu/fr/notice/-/detail/1-2026",
        titulaires: [{ nom: "Nettoyage du Rhône", identifiant: "11111111100011" }, { nom: "Brouillon", identifiant: null }],
      }),
      avis({ uid: "boamp-26-2", numero: "26-2", type: "rectificatif", objet: "Rectificatif nettoyage", departements: ["01"] }),
    ];
    await enregistrerAvis(sql, premier);
    // Un second import met à jour les avis et remplace leurs titulaires.
    premier[1] = { ...premier[1], titulaires: [{ nom: "Nettoyage du Rhône", identifiant: "11111111100011" }] };
    await enregistrerAvis(sql, premier);
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("enregistre les avis, leurs départements et leurs titulaires sans doublon", async () => {
    const lignes = await sql`select uid, array_to_json(departements) as departements,
      array_to_json(descripteurs) as descripteurs from avis order by uid`;
    expect(lignes).toEqual([
      { uid: "boamp-26-1", departements: ["69"], descripteurs: ["Nettoyage", 'Propreté "urbaine"'] },
      { uid: "boamp-26-2", departements: ["01"], descripteurs: ["Nettoyage", 'Propreté "urbaine"'] },
      { uid: "ted-1-2026", departements: ["69"], descripteurs: null },
    ]);
    expect(await sql`select avis_uid, nom, siren from avis_titulaires`).toEqual([
      { avis_uid: "ted-1-2026", nom: "Nettoyage du Rhône", siren: "111111111" },
    ]);
  });

  it("liste les avis sans les rectificatifs, avec filtres", async () => {
    expect((await listerAvis(sql)).map((a) => a.uid)).toEqual(["boamp-26-1", "ted-1-2026"]);
    expect((await listerAvis(sql, { type: "marche", departement: "69" })).map((a) => a.uid)).toEqual(["boamp-26-1"]);
    expect((await listerAvis(sql, { texte: "gymnases" })).map((a) => a.uid)).toEqual(["ted-1-2026"]);
    expect(await listerAvis(sql, { cpv: "45" })).toEqual([]);
    const [attribution] = await listerAvis(sql, { type: "attribution" });
    expect(attribution.titulaires).toEqual([{ nom: "NETTOYAGE DU RHONE", siren: "111111111" }]);
  });

  it("affiche les noms Sirene dans les renouvellements", async () => {
    const [s1] = await listerRenouvellements(sql, { cpv: "909" });
    expect(s1).toMatchObject({
      acheteur_nom: "COMMUNE DE TEST",
      titulaires: [{ id: "11111111100011", siren: "111111111", nom: "NETTOYAGE DU RHONE" }],
    });
  });

  it("construit la fiche d'un acheteur", async () => {
    const fiche = await ficheAcheteur(sql, ACHETEUR);
    expect(fiche).toMatchObject({
      nom: "COMMUNE DE TEST", categorie: "Commune et commune nouvelle", departement: "69", marches: 4,
      montant: 250000, offres_moyennes: 2.5, marches_avec_offres: 4, offre_unique: 1,
    });
    expect(fiche!.renouvellements.map((r) => r.objet)).toEqual(["Nettoyage", "Nettoyage des écoles"]);
    expect(fiche!.divisions[0]).toEqual({ division: "45", marches: 1, montant: 90000 });
    expect(fiche!.titulaires).toHaveLength(4);
    expect(fiche!.avis.map((a) => a.uid)).toEqual(["boamp-26-1", "boamp-26-2", "ted-1-2026"]);
    expect(await ficheAcheteur(sql, "99999999999999")).toBeNull();
  });

  it("construit la fiche d'une entreprise", async () => {
    const fiche = await ficheEntreprise(sql, "111111111");
    expect(fiche).toMatchObject({
      nom: "NETTOYAGE DU RHONE", naf: "81.21Z", naf_libelle: "Nettoyage courant des bâtiments",
      categorie_juridique: "SAS, société par actions simplifiée", marches: 1, nb_acheteurs: 1, montant: 50000,
      acheteurs: [{ siret: ACHETEUR, nom: "COMMUNE DE TEST", marches: 1, montant: 50000 }],
    });
    expect(fiche!.echeances.map((e) => e.objet)).toEqual(["Nettoyage"]);
    expect(fiche!.attributions.map((a) => a.uid)).toEqual(["ted-1-2026"]);
    // entrepreneur individuel qui refuse la diffusion : fiche sans nom
    expect(await ficheEntreprise(sql, "222222222")).toMatchObject({ nom: null, diffusible: false });
    expect(await ficheEntreprise(sql, "999999999")).toBeNull();
  });
});
