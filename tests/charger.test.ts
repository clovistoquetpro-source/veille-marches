/**
 * Test d'intégration : migrations + chargement dans un vrai PostgreSQL.
 * Ne tourne que si DATABASE_URL_TEST pointe vers une base locale (la base est vidée).
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Avis, enregistrerAvis } from "../src/ingest/avis";
import { chargerDecp, journaliser, migrer } from "../src/ingest/charger";
import { exporterCsv, normaliser } from "../src/ingest/decp";
import { chargerEntreprises } from "../src/ingest/sirene";
import { ficheAcheteur } from "../src/lib/acheteurs";
import { abonnementDuCompte, majAbonnement, ouvrirEssai } from "../src/lib/abonnements";
import { destinataires, envoyerAlertes } from "../src/lib/alertes";
import {
  chercherConcurrents, concurrentsDuCompte, concurrentsProbables, estSuivie, gainsDesConcurrents, nePlusSuivre,
  suivreEntreprise,
} from "../src/lib/concurrents";
import { compteDeLaSession, creerCompte, desinscrire, fermerSession, ouvrirSession } from "../src/lib/comptes";
import type { Courriel } from "../src/lib/courriel";
import { avisDuProfil, renouvellementsDuProfil } from "../src/lib/correspondance";
import { listerAvis } from "../src/lib/avis";
import { ficheEntreprise } from "../src/lib/entreprises";
import { profilPropose } from "../src/lib/inscription";
import { enregistrerProfil, profilDuCompte } from "../src/lib/profil";
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
const ACHETEUR = "21690123100011";

/** Date à n jours d'aujourd'hui (négatif : dans le passé), pour que les avis restent « en cours ». */
function dansJours(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const avis = (champs: Partial<Avis>): Avis => ({
  uid: "boamp-26-1", source: "boamp", numero: "26-1", type: "marche", objet: "Nettoyage des écoles",
  acheteur_nom: "Ville de Test", acheteur_siret: ACHETEUR, cpv: "90910000", famille: "services",
  descripteurs: ["Nettoyage", "Propreté \"urbaine\""], departements: ["69"], date_publication: dansJours(-5),
  date_limite: dansJours(27), montant: null, offres_recues: null, url: "https://www.boamp.fr/pages/avis/?q=idweb:26-1",
  avis_initial: null, titulaires: [],
  ...champs,
});

describe.skipIf(!locale)("avis, entreprises et fiches", () => {
  let sql: postgres.Sql;

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
        descripteurs: null, date_publication: dansJours(-6), date_limite: null, montant: 45000,
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

/** Suite des précédentes : inscription, profil de veille et marchés qui en découlent. */
describe.skipIf(!locale)("comptes et veille personnalisée", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(url!, { max: 1, onnotice: () => {}, fetch_types: false });
    // sans clé d'API, le profil de repli est déduit de l'activité déclarée : le test reste hors ligne
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await sql?.end();
  });

  const annuaire = {
    siren: "111111111", siret: "11111111100011", nom: "NETTOYAGE DU RHONE", naf: "81.21Z",
    departement: "01", commune: "BOURG-EN-BRESSE", active: true,
  };

  it("propose à une entreprise connue le profil de ses marchés déjà gagnés", async () => {
    // un seul marché gagné : pas assez pour deviner, on retombe sur l'activité déclarée et son département
    expect(await profilPropose(sql, annuaire)).toEqual({
      cpv: [], mots_cles: ["nettoyage", "courant", "bâtiments"], departements: ["01"], origine: "manuel",
    });
  });

  it("crée le compte, sa session et son profil, puis les retrouve", async () => {
    const compte = await creerCompte(sql, {
      email: "clo@exemple.fr", siren: annuaire.siren, siret: annuaire.siret, nom: annuaire.nom,
    });
    expect(compte).toMatchObject({ email: "clo@exemple.fr", siren: "111111111" });
    // se réinscrire avec une autre entreprise ne crée pas un second compte
    const encore = await creerCompte(sql, { email: "clo@exemple.fr", siren: "222222222", siret: null, nom: "AUTRE" });
    expect(encore.id).toBe(compte.id);

    const session = await ouvrirSession(sql, compte.id);
    expect(await compteDeLaSession(sql, session)).toMatchObject({ id: compte.id, nom: "AUTRE" });
    expect(await compteDeLaSession(sql, "inconnue")).toBeNull();
    expect(await compteDeLaSession(sql, undefined)).toBeNull();
    await sql`update sessions set expire_le = now() - interval '1 day' where id = ${session}`;
    expect(await compteDeLaSession(sql, session)).toBeNull();
    await fermerSession(sql, session);

    await enregistrerProfil(sql, compte.id, {
      cpv: ["90910000-9"], mots_cles: ["Gymnases"], departements: ["69"], origine: "historique",
    });
    expect(await profilDuCompte(sql, compte.id)).toEqual({
      cpv: ["90910000"], mots_cles: ["gymnases"], departements: ["69"], origine: "historique",
      frequence: "quotidienne",
    });
  });

  it("remonte les avis en cours et les marchés à reconquérir du profil", async () => {
    const profil = { cpv: ["90910"], mots_cles: [], departements: ["69"], origine: "historique" as const };
    expect((await avisDuProfil(sql, profil)).map((a) => a.uid)).toEqual(["boamp-26-1"]);
    expect((await renouvellementsDuProfil(sql, profil)).map((r) => r.objet)).toEqual([
      "Nettoyage", "Nettoyage des écoles",
    ]);
    // un mot-clé suffit, même sans code CPV ; un autre département ne remonte rien
    expect((await avisDuProfil(sql, { ...profil, cpv: [], mots_cles: ["gymnase"] })).map((a) => a.uid)).toEqual([]);
    expect(await avisDuProfil(sql, { ...profil, departements: ["75"] })).toEqual([]);
    expect(await renouvellementsDuProfil(sql, { ...profil, departements: ["75"] })).toEqual([]);
    // un profil vide ne remonte rien plutôt que tout
    expect(await avisDuProfil(sql, { ...profil, cpv: [] })).toEqual([]);
    expect(await renouvellementsDuProfil(sql, { ...profil, cpv: [] })).toEqual([]);
  });
});

/** Suite des précédentes : envoi des alertes par courriel. */
describe.skipIf(!locale)("alertes par courriel", () => {
  let sql: postgres.Sql;
  const envoyes: Courriel[] = [];
  const envoyeur = async (courriel: Courriel) => {
    envoyes.push(courriel);
  };

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, onnotice: () => {}, fetch_types: false });
    // le marché S3 finit dans 9 mois : il entre dans la fenêtre de relance de 6 à 12 mois
    const compte = await creerCompte(sql, {
      email: "alerte@exemple.fr", siren: "111111111", siret: null, nom: "NETTOYAGE DU RHONE",
    });
    await enregistrerProfil(sql, compte.id, {
      cpv: ["90910"], mots_cles: [], departements: ["69"], origine: "historique", frequence: "hebdomadaire",
    });
    await ouvrirEssai(sql, compte.id);
    // un compte sans code CPV ni mot-clé ne doit jamais recevoir de courriel
    const vide = await creerCompte(sql, { email: "vide@exemple.fr", siren: null, siret: null, nom: null });
    await enregistrerProfil(sql, vide.id, {
      cpv: [], mots_cles: [], departements: [], origine: "manuel", frequence: "hebdomadaire",
    });
    await ouvrirEssai(sql, vide.id);
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("ne retient que les clients dont le profil peut remonter quelque chose", async () => {
    const liste = await destinataires(sql, "hebdomadaire");
    expect(liste.map((d) => d.email)).toEqual(["alerte@exemple.fr"]);
    expect(liste[0].profil).toEqual({
      cpv: ["90910"], mots_cles: [], departements: ["69"], origine: "historique",
    });
    // le compte au profil vide n'est proposé pour aucun rythme
    const quotidien = (await destinataires(sql, "quotidienne")).map((d) => d.email);
    expect(quotidien).not.toContain("alerte@exemple.fr");
    expect(quotidien).not.toContain("vide@exemple.fr");
  });

  it("envoie une alerte, puis ne répète pas ce qui a déjà été annoncé", async () => {
    const premier = await envoyerAlertes(sql, envoyeur, "hebdomadaire");
    expect(premier).toEqual({ envoyees: 1, erreurs: 0, sansNouveaute: 0 });
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].a).toBe("alerte@exemple.fr");
    expect(envoyes[0].texte).toContain("Nettoyage des écoles");

    const second = await envoyerAlertes(sql, envoyeur, "hebdomadaire");
    expect(second).toEqual({ envoyees: 0, erreurs: 0, sansNouveaute: 1 });
    expect(envoyes).toHaveLength(1);

    const [alerte] = await sql`select statut, nb_avis, nb_renouvellements from alertes order by id desc limit 1`;
    expect(alerte.statut).toBe("envoyee");
  });

  it("journalise un envoi raté sans arrêter les autres, et le reprend au passage suivant", async () => {
    await sql`delete from alertes_avis`;
    await sql`delete from alertes_marches`;
    const resultat = await envoyerAlertes(sql, async () => {
      throw new Error("Brevo : erreur 500");
    }, "hebdomadaire");
    expect(resultat).toEqual({ envoyees: 0, erreurs: 1, sansNouveaute: 0 });
    const [erreur] = await sql`select statut, message from alertes order by id desc limit 1`;
    expect(erreur).toMatchObject({ statut: "erreur", message: "Brevo : erreur 500" });
    // rien n'a été retenu comme annoncé : le prochain passage reprend le même contenu
    expect((await envoyerAlertes(sql, envoyeur, "hebdomadaire")).envoyees).toBe(1);
  });

  it("n'écrit plus quand l'essai est fini, et reprend quand l'abonnement est payé", async () => {
    const [compte] = await sql<{ id: string }[]>`select id from comptes where email = 'alerte@exemple.fr'`;
    await sql`delete from alertes_avis`;
    await sql`delete from alertes_marches`;
    await sql`update abonnements set fin_essai = current_date - 1 where compte_id = ${compte.id}`;
    expect((await destinataires(sql, "hebdomadaire")).map((d) => d.email)).toEqual([]);

    await majAbonnement(sql, compte.id, { statut: "actif", client_stripe: "cus_1", abonnement_stripe: "sub_1" });
    expect(await abonnementDuCompte(sql, compte.id)).toMatchObject({ statut: "actif", client_stripe: "cus_1" });
    expect((await envoyerAlertes(sql, envoyeur, "hebdomadaire")).envoyees).toBe(1);
  });

  it("coupe les alertes depuis le lien de désinscription", async () => {
    const [{ jeton }] = await sql<{ jeton: string }[]>`select jeton from comptes where email = 'alerte@exemple.fr'`;
    expect(await desinscrire(sql, jeton)).toBe(true);
    expect(await desinscrire(sql, "jeton-inconnu")).toBe(false);
    await sql`delete from alertes_avis`;
    await sql`delete from alertes_marches`;
    expect(await envoyerAlertes(sql, envoyeur, "hebdomadaire")).toEqual({ envoyees: 0, erreurs: 0, sansNouveaute: 0 });
  });
});

/** Suite des précédentes : un client suit ses concurrents et apprend ce qu'ils gagnent. */
describe.skipIf(!locale)("veille des concurrents", () => {
  let sql: postgres.Sql;
  let compteId: string;
  const CONCURRENT = "555555555";
  const AUTRE_ACHETEUR = "21010001200017";
  const annuaire = async (siren: string) => siren === "666666666"
    ? { siren, siret: null, nom: "NOUVELLE ENTREPRISE", naf: null, departement: null, commune: null, active: true }
    : null;

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, onnotice: () => {}, fetch_types: false });
    await sql`insert into entreprises (siren, nom, active, diffusible) values (${CONCURRENT}, 'PROPRETE DU LYONNAIS', true, true)`;
    // deux lots du même marché notifiés il y a vingt jours, et un marché trop ancien pour être annoncé
    const marche = (uid: string, objet: string, montant: number, notification: number) => ({
      uid, id_marche: uid, acheteur_siret: ACHETEUR, objet, cpv: "90910000", famille: "services", renouvelable: true,
      montant, date_notification: dansJours(notification), duree_mois: 12, date_fin_estimee: dansJours(notification + 365),
      departement: "69", format: "2022",
    });
    await sql`insert into marches ${sql([
      marche("G1", "Nettoyage des crèches", 10000, -20),
      marche("G2", "Nettoyage des crèches", 20000, -20),
      marche("G3", "Vitrerie", 5000, -800),
    ])}`;
    await sql`insert into marches_titulaires ${sql(["G1", "G2", "G3"].map((uid) => ({
      marche_uid: uid, titulaire_id: `${CONCURRENT}00055`, type_identifiant: "SIRET",
    })))}`;
    // le BOAMP ne donne que le nom du titulaire, écrit autrement que dans la base Sirene
    await enregistrerAvis(sql, [avis({
      uid: "boamp-26-50", numero: "26-50", type: "attribution", objet: "Nettoyage du collège",
      acheteur_siret: AUTRE_ACHETEUR, acheteur_nom: "Département de l'Ain", date_publication: dansJours(-5),
      date_limite: null, montant: 42000, titulaires: [{ nom: "Sas Propreté du Lyonnais", identifiant: null }],
    })]);

    const compte = await creerCompte(sql, { email: "concurrents@exemple.fr", siren: "111111111", siret: null, nom: null });
    compteId = compte.id;
    // aucun code CPV ni mot-clé : seuls ses concurrents lui valent des courriels
    await enregistrerProfil(sql, compteId, {
      cpv: [], mots_cles: [], departements: [], origine: "manuel", frequence: "hebdomadaire",
    });
    await ouvrirEssai(sql, compteId);
  });

  afterAll(async () => {
    await sql?.end();
  });

  const profil = { cpv: ["90910"], mots_cles: [], departements: ["69"], origine: "manuel" as const };

  it("propose les entreprises qui gagnent les marchés du profil, et en retrouve par leur nom", async () => {
    expect(await concurrentsProbables(sql, compteId, profil, "111111111")).toEqual([
      { siren: CONCURRENT, nom: "PROPRETE DU LYONNAIS", acheteurs: 1, marches: 2 },
    ]);
    // personne à Paris : on élargit à toute la France ; rien du tout dans les travaux
    expect((await concurrentsProbables(sql, compteId, { ...profil, departements: ["75"] }, null)).map((c) => c.siren))
      .toEqual([CONCURRENT]);
    expect(await concurrentsProbables(sql, compteId, { ...profil, cpv: ["45"] }, null)).toEqual([]);
    expect((await chercherConcurrents(sql, "propreté lyonnais")).map((c) => c.siren)).toEqual([CONCURRENT]);
    expect(await chercherConcurrents(sql, "inconnue")).toEqual([]);
    expect(await chercherConcurrents(sql, " ")).toEqual([]);
  });

  it("suit une entreprise par son SIREN ou son SIRET, connue chez nous ou dans l'annuaire", async () => {
    expect(await suivreEntreprise(sql, compteId, `${CONCURRENT}00055`, annuaire)).toEqual({ ok: true, nom: "PROPRETE DU LYONNAIS" });
    expect(await suivreEntreprise(sql, compteId, "666 666 666", annuaire)).toEqual({ ok: true, nom: "NOUVELLE ENTREPRISE" });
    expect(await suivreEntreprise(sql, compteId, "777777777", annuaire)).toMatchObject({ ok: false });
    expect(await suivreEntreprise(sql, compteId, "12345", annuaire)).toMatchObject({ ok: false });
    expect(await estSuivie(sql, compteId, CONCURRENT)).toBe(true);
    // une entreprise suivie ne fait plus partie des suggestions
    expect(await concurrentsProbables(sql, compteId, profil, "111111111")).toEqual([]);

    expect(await concurrentsDuCompte(sql, compteId)).toEqual([
      { siren: "666666666", nom: "NOUVELLE ENTREPRISE", marches_12_mois: 0, dernier_marche: null, echeances: 0 },
      { siren: CONCURRENT, nom: "PROPRETE DU LYONNAIS", marches_12_mois: 2, dernier_marche: dansJours(-20), echeances: 2 },
    ]);
    await nePlusSuivre(sql, compteId, "666666666");
    expect((await concurrentsDuCompte(sql, compteId)).map((c) => c.siren)).toEqual([CONCURRENT]);
  });

  it("rassemble ses gains : avis d'attribution reconnus par le nom, et lots des DECP regroupés", async () => {
    expect(await gainsDesConcurrents(sql, compteId)).toEqual([
      {
        source: "avis", uid: "boamp-26-50", uids: ["boamp-26-50"], nb_lots: 1, siren: CONCURRENT,
        entreprise: "PROPRETE DU LYONNAIS", objet: "Nettoyage du collège", acheteur_siret: AUTRE_ACHETEUR,
        acheteur_nom: "Département de l'Ain", montant: 42000, date: dansJours(-5),
        url: "https://www.boamp.fr/pages/avis/?q=idweb:26-1",
      },
      {
        source: "marche", uid: "G2", uids: expect.arrayContaining(["G1", "G2"]), nb_lots: 2, siren: CONCURRENT,
        entreprise: "PROPRETE DU LYONNAIS", objet: "Nettoyage des crèches", acheteur_siret: ACHETEUR,
        acheteur_nom: "COMMUNE DE TEST", montant: 30000, date: dansJours(-20), url: null,
      },
    ]);
  });

  it("ne répète pas dans les DECP un marché déjà connu par son avis d'attribution", async () => {
    await enregistrerAvis(sql, [avis({
      uid: "boamp-26-51", numero: "26-51", type: "attribution", objet: "Nettoyage des crèches municipales",
      date_publication: dansJours(-3), date_limite: null, titulaires: [{ nom: "PDL", identifiant: `${CONCURRENT}00055` }],
    })]);
    expect((await gainsDesConcurrents(sql, compteId)).map((g) => g.uid)).toEqual(["boamp-26-51", "boamp-26-50"]);
  });

  it("annonce par courriel, même sans profil de veille, ce qu'elle gagne après le début du suivi", async () => {
    expect((await destinataires(sql, "hebdomadaire")).map((d) => d.email)).toContain("concurrents@exemple.fr");
    const envoyes: Courriel[] = [];
    expect(await envoyerAlertes(sql, async (c) => { envoyes.push(c); }, "hebdomadaire"))
      .toEqual({ envoyees: 1, erreurs: 0, sansNouveaute: 0 });
    // l'avis 26-50 et les lots G1 et G2 étaient déjà connus quand le client a commencé à la suivre
    expect(envoyes[0].sujet).toBe("1 marché gagné par vos concurrents");
    expect(envoyes[0].texte).toContain("PROPRETE DU LYONNAIS : Nettoyage des crèches municipales");
    expect(envoyes[0].texte).not.toContain("Nettoyage du collège");
    const [alerte] = await sql`select nb_gains from alertes where compte_id = ${compteId}`;
    expect(alerte.nb_gains).toBe(1);
    expect(await envoyerAlertes(sql, async (c) => { envoyes.push(c); }, "hebdomadaire"))
      .toEqual({ envoyees: 0, erreurs: 0, sansNouveaute: 1 });
    expect(await gainsDesConcurrents(sql, compteId, { nonAnnonces: true })).toEqual([]);
  });
});
