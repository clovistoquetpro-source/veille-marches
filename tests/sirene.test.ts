import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraireEntreprises } from "../src/ingest/sirene";

describe("unités légales Sirene", () => {
  it("ne garde que les SIREN demandés et masque le nom des entrepreneurs non diffusibles", async () => {
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    // mêmes colonnes et mêmes types que le fichier StockUniteLegale
    await con.run(`create table ul as select * from (values
      ('111111111', 'O', 'NETTOYAGE DU RHONE', 'NDR', null, null, null, null, 5710, '81.21Z', 'NAFRev2', '12', 'PME', date '2005-03-01', 'A'),
      ('222222222', 'P', '[ND]', '[ND]', '[ND]', '[ND]', '[ND]', null, 1000, '43.21A', 'NAFRev2', 'NN', 'PME', date '2015-01-01', 'A'),
      ('333333333', 'O', null, null, 'Jean', null, 'MARTIN', 'DURAND', 1000, '74.1Z', 'NAF1993', null, null, date '1990-01-01', 'C'),
      ('444444444', 'O', 'NON DEMANDEE', null, null, null, null, null, 5710, '81.21Z', 'NAFRev2', '01', 'PME', date '2000-01-01', 'A')
    ) t(siren, statutDiffusionUniteLegale, denominationUniteLegale, sigleUniteLegale,
        prenom1UniteLegale, prenomUsuelUniteLegale, nomUniteLegale, nomUsageUniteLegale,
        categorieJuridiqueUniteLegale, activitePrincipaleUniteLegale, nomenclatureActivitePrincipaleUniteLegale,
        trancheEffectifsUniteLegale, categorieEntreprise, dateCreationUniteLegale, etatAdministratifUniteLegale)`);
    await con.run(`alter table ul add column denominationUsuelle1UniteLegale varchar`);
    await con.run(`create table sirens as select * from (values ('111111111'), ('222222222'), ('333333333')) t(siren)`);

    const sortie = path.join(await mkdtemp(path.join(tmpdir(), "sirene-test-")), "entreprises.csv");
    await extraireEntreprises(con, "ul", "sirens", sortie);
    const lignes = (await con.runAndReadAll(
      `select * from read_csv('${sortie}', header = true, all_varchar = true) order by siren`,
    )).getRowObjectsJson();

    expect(lignes).toEqual([
      { siren: "111111111", nom: "NETTOYAGE DU RHONE", sigle: "NDR", categorie_juridique: "5710", naf: "81.21Z",
        tranche_effectif: "12", categorie: "PME", date_creation: "2005-03-01", active: "true", diffusible: "true" },
      { siren: "222222222", nom: null, sigle: null, categorie_juridique: "1000", naf: "43.21A",
        tranche_effectif: null, categorie: "PME", date_creation: "2015-01-01", active: "true", diffusible: "false" },
      // entrepreneur individuel diffusible : prénom et nom d'usage ; ancienne nomenclature NAF écartée
      { siren: "333333333", nom: "Jean DURAND", sigle: null, categorie_juridique: "1000", naf: null,
        tranche_effectif: null, categorie: null, date_creation: "1990-01-01", active: "false", diffusible: "true" },
    ]);
  });
});
