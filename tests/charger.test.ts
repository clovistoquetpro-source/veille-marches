/**
 * Test d'intégration : migrations + chargement dans un vrai PostgreSQL.
 * Ne tourne que si DATABASE_URL_TEST pointe vers une base locale (la base est vidée).
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chargerDecp, journaliser, migrer } from "../src/ingest/charger";
import { exporterCsv, normaliser } from "../src/ingest/decp";
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
    expect(s1).toMatchObject({ objet: "Nettoyage", acheteur_nom: "Ville de Test", titulaires: ["11111111100011"] });
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
