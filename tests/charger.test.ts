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
import { type Avis, enregistrerAvis, purgerAvis } from "../src/ingest/avis";
import { chargerDecp, exporterEnBase, journaliser, migrer } from "../src/ingest/charger";
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
import {
  connecter, demanderReinitialisation, IDENTIFIANTS_INCORRECTS, LIEN_INVALIDE, lienValable, reinitialiserMotDePasse,
  TROP_D_ESSAIS,
} from "../src/lib/connexion";
import type { Courriel } from "../src/lib/courriel";
import { avisDuProfil, renouvellementsDuProfil } from "../src/lib/correspondance";
import { listerAvis } from "../src/lib/avis";
import { ficheEntreprise } from "../src/lib/entreprises";
import { ADRESSE_DEJA_INSCRITE, ficheLocale, inscrire, profilPropose } from "../src/lib/inscription";
import { INDISPONIBLE } from "../src/lib/annuaire";
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
    const dossier = await mkdtemp(path.join(tmpdir(), "decp-test-"));
    const fichiers = await exporterCsv(con, dossier);
    await journaliser(sql, "decp", () => chargerDecp(sql, fichiers));
    // Un second import des mêmes données ne change rien.
    await exporterEnBase(sql, path.join(dossier, "en-base.csv"));
    const second = await exporterCsv(con, dossier, { enBase: path.join(dossier, "en-base.csv") });
    expect([second.nbAjoutes, second.nbSupprimes]).toEqual([0, 0]);
    await chargerDecp(sql, second);
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
    await sql`insert into marches_titulaires (marche_id, titulaire_id, type_identifiant)
      select id, '444444444', 'SIRET' from marches where uid = '21690123100011-S1'`;
    const [siren] = await sql`select siren from marches_titulaires where titulaire_id = '444444444'`;
    expect(siren.siren).toBe("444444444");
    await sql`delete from marches_titulaires where titulaire_id = '444444444'`;
  });

  it("liste seulement les services et fournitures qui finissent dans les 12 mois", async () => {
    const lignes = await sql`select uid, deja_relance_le is not null as deja_relance
      from renouvellements order by uid`;
    expect(lignes).toEqual([
      { uid: "21690123100011-S1", deja_relance: true },
      { uid: "21690123100011-S3", deja_relance: false },
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

  it("inscrit une entreprise déjà connue de notre base quand l'annuaire ne répond pas", async () => {
    const enPanne = async (): Promise<typeof INDISPONIBLE> => INDISPONIBLE;
    expect(await ficheLocale(sql, "11111111100011")).toEqual({
      siren: "111111111", siret: "11111111100011", nom: "NETTOYAGE DU RHONE", naf: "81.21Z",
      departement: null, commune: null, active: true,
    });
    // entreprise non diffusible : on ne montre pas son nom
    expect((await ficheLocale(sql, "222222222"))?.nom).toBeNull();

    const inscription = await inscrire(
      sql, { identifiant: "111 111 111", email: "repli@exemple.fr", motDePasse: "un bon mot de passe" }, enPanne,
    );
    expect(inscription).toMatchObject({ ok: true, entreprise: { siren: "111111111", nom: "NETTOYAGE DU RHONE" } });
    await sql`delete from comptes where email = 'repli@exemple.fr'`;

    // inconnue de notre base : on ne peut pas savoir si le numéro existe, on demande de réessayer
    expect(await inscrire(
      sql, { identifiant: "333333333", email: "repli@exemple.fr", motDePasse: "un bon mot de passe" }, enPanne,
    )).toEqual({
      ok: false, erreur: "L'annuaire des entreprises ne répond pas pour l'instant. Réessayez dans une minute.",
    });
  });

  it("crée le compte, sa session et son profil, puis les retrouve", async () => {
    const compte = (await creerCompte(sql, {
      email: "clo@exemple.fr", siren: annuaire.siren, siret: annuaire.siret, nom: annuaire.nom,
    }))!;
    expect(compte).toMatchObject({ email: "clo@exemple.fr", siren: "111111111" });
    // une adresse déjà inscrite ne crée pas un second compte et ne touche pas au premier
    expect(await creerCompte(sql, { email: "clo@exemple.fr", siren: "222222222", siret: null, nom: "AUTRE" })).toBeNull();

    const session = await ouvrirSession(sql, compte.id);
    expect(await compteDeLaSession(sql, session)).toMatchObject({ id: compte.id, nom: "NETTOYAGE DU RHONE" });
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

/** Suite des précédentes : connexion par adresse et mot de passe, et mot de passe oublié. */
describe.skipIf(!locale)("connexion par mot de passe", () => {
  let sql: postgres.Sql;
  const fiche = {
    siren: "111111111", siret: "11111111100011", nom: "NETTOYAGE DU RHONE", naf: "81.21Z",
    departement: "01", commune: "BOURG-EN-BRESSE", active: true,
  };
  const annuaire = async () => fiche;
  const envoyes: Courriel[] = [];
  const envoyeur = async (courriel: Courriel) => {
    envoyes.push(courriel);
  };
  const site = "https://radar.exemple.fr";

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, onnotice: () => {}, fetch_types: false });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("crée le compte avec son mot de passe, puis connecte seulement avec le bon", async () => {
    const saisie = { identifiant: "11111111100011", email: "Motdepasse@Exemple.fr", motDePasse: "cheval-batterie-agrafe" };
    expect(await inscrire(sql, { ...saisie, motDePasse: "court" }, annuaire)).toEqual({
      ok: false, erreur: "Choisissez un mot de passe d'au moins 8 caractères.",
    });
    expect(await inscrire(sql, saisie, annuaire)).toMatchObject({ ok: true, compte: { email: "motdepasse@exemple.fr" } });
    // le mot de passe n'est pas gardé en clair
    const [{ mot_de_passe }] = await sql`select mot_de_passe from comptes where email = 'motdepasse@exemple.fr'`;
    expect(mot_de_passe).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(mot_de_passe).not.toContain("cheval");
    // se réinscrire avec la même adresse ne prend pas la main sur le compte
    expect(await inscrire(sql, { ...saisie, motDePasse: "un autre mot de passe" }, annuaire)).toEqual({
      ok: false, erreur: ADRESSE_DEJA_INSCRITE,
    });

    expect(await connecter(sql, { email: " MOTDEPASSE@exemple.fr ", motDePasse: "cheval-batterie-agrafe" }))
      .toMatchObject({ ok: true, compte: { email: "motdepasse@exemple.fr", siren: "111111111" } });
    expect(await connecter(sql, { email: "motdepasse@exemple.fr", motDePasse: "un autre mot de passe" }))
      .toEqual({ ok: false, erreur: IDENTIFIANTS_INCORRECTS });
    // adresse inconnue ou compte sans mot de passe : même réponse, on ne dit pas qui est inscrit
    expect(await connecter(sql, { email: "personne@exemple.fr", motDePasse: "cheval-batterie-agrafe" }))
      .toEqual({ ok: false, erreur: IDENTIFIANTS_INCORRECTS });
    await creerCompte(sql, { email: "ancien@exemple.fr", siren: null, siret: null, nom: null });
    expect(await connecter(sql, { email: "ancien@exemple.fr", motDePasse: "" }))
      .toEqual({ ok: false, erreur: IDENTIFIANTS_INCORRECTS });
  });

  it("bloque la connexion un quart d'heure après cinq essais ratés", async () => {
    const essai = (motDePasse: string) => connecter(sql, { email: "motdepasse@exemple.fr", motDePasse });
    expect(await essai("cheval-batterie-agrafe")).toMatchObject({ ok: true });
    for (let i = 0; i < 4; i++) expect(await essai("faux")).toEqual({ ok: false, erreur: IDENTIFIANTS_INCORRECTS });
    expect(await essai("faux")).toEqual({ ok: false, erreur: TROP_D_ESSAIS });
    // même le bon mot de passe attend la fin du blocage
    expect(await essai("cheval-batterie-agrafe")).toEqual({ ok: false, erreur: TROP_D_ESSAIS });
    await sql`update comptes set bloque_jusqu_au = now() - interval '1 minute' where email = 'motdepasse@exemple.fr'`;
    expect(await essai("cheval-batterie-agrafe")).toMatchObject({ ok: true });
    const [{ echecs_connexion }] = await sql`select echecs_connexion from comptes where email = 'motdepasse@exemple.fr'`;
    expect(echecs_connexion).toBe(0);
  });

  it("envoie un lien qui sert une fois pour choisir un nouveau mot de passe", async () => {
    const [{ id }] = await sql`select id from comptes where email = 'motdepasse@exemple.fr'`;
    const autreSession = await ouvrirSession(sql, id);
    await demanderReinitialisation(sql, { email: "personne@exemple.fr", site }, envoyeur);
    expect(envoyes).toEqual([]);

    await demanderReinitialisation(sql, { email: "MotDePasse@exemple.fr", site: `${site}/` }, envoyeur);
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].a).toBe("motdepasse@exemple.fr");
    const jeton = envoyes[0].texte.match(/connexion\/nouveau\?jeton=([0-9a-f]{64})/)?.[1];
    expect(jeton).toBeDefined();
    expect(envoyes[0].html).toContain(`${site}/connexion/nouveau?jeton=${jeton}`);
    // la base ne garde que l'empreinte du jeton
    expect(await sql`select 1 from reinitialisations where jeton_hash = ${jeton!}`).toHaveLength(0);
    expect(await lienValable(sql, jeton!)).toBe(true);

    expect(await reinitialiserMotDePasse(sql, { jeton: jeton!, motDePasse: "court" })).toEqual({
      ok: false, erreur: "Choisissez un mot de passe d'au moins 8 caractères.",
    });
    expect(await reinitialiserMotDePasse(sql, { jeton: jeton!, motDePasse: "nouveau-mot-de-passe" }))
      .toMatchObject({ ok: true, compte: { id } });
    // le lien ne sert qu'une fois, et les autres sessions sont fermées
    expect(await lienValable(sql, jeton!)).toBe(false);
    expect(await reinitialiserMotDePasse(sql, { jeton: jeton!, motDePasse: "encore-un-autre" }))
      .toEqual({ ok: false, erreur: LIEN_INVALIDE });
    expect(await compteDeLaSession(sql, autreSession)).toBeNull();
    expect(await connecter(sql, { email: "motdepasse@exemple.fr", motDePasse: "cheval-batterie-agrafe" }))
      .toEqual({ ok: false, erreur: IDENTIFIANTS_INCORRECTS });
    expect(await connecter(sql, { email: "motdepasse@exemple.fr", motDePasse: "nouveau-mot-de-passe" }))
      .toMatchObject({ ok: true });

    // un compte créé avant les mots de passe en choisit un de la même façon
    envoyes.length = 0;
    await demanderReinitialisation(sql, { email: "ancien@exemple.fr", site }, envoyeur);
    const jetonAncien = envoyes[0].texte.match(/jeton=([0-9a-f]{64})/)![1];
    expect(await reinitialiserMotDePasse(sql, { jeton: jetonAncien, motDePasse: "enfin-un-mot-de-passe" }))
      .toMatchObject({ ok: true });
    expect(await connecter(sql, { email: "ancien@exemple.fr", motDePasse: "enfin-un-mot-de-passe" }))
      .toMatchObject({ ok: true });
  });

  it("n'envoie pas plus de trois liens par heure à une même adresse", async () => {
    envoyes.length = 0;
    for (let i = 0; i < 4; i++) await demanderReinitialisation(sql, { email: "ancien@exemple.fr", site }, envoyeur);
    // le lien du test précédent a été consommé : il n'en reste pas, trois nouveaux partent
    expect(envoyes).toHaveLength(3);
    const [{ expire }] = await sql`
      select bool_and(expire_le between now() + interval '59 minutes' and now() + interval '61 minutes') as expire
      from reinitialisations r join comptes c on c.id = r.compte_id where c.email = 'ancien@exemple.fr'`;
    expect(expire).toBe(true);
    await sql`delete from comptes where email in ('motdepasse@exemple.fr', 'ancien@exemple.fr')`;
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
    const compte = (await creerCompte(sql, {
      email: "alerte@exemple.fr", siren: "111111111", siret: null, nom: "NETTOYAGE DU RHONE",
    }))!;
    await enregistrerProfil(sql, compte.id, {
      cpv: ["90910"], mots_cles: [], departements: ["69"], origine: "historique", frequence: "hebdomadaire",
    });
    await ouvrirEssai(sql, compte.id);
    // un compte sans code CPV ni mot-clé ne doit jamais recevoir de courriel
    const vide = (await creerCompte(sql, { email: "vide@exemple.fr", siren: null, siret: null, nom: null }))!;
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

  it("prévient en continu ceux qui veulent les offres dès qu'elles sortent", async () => {
    await sql`update profils set frequence = 'en_continu' where compte_id = (select id from comptes where email = 'alerte@exemple.fr')`;
    expect((await destinataires(sql, "en_continu")).map((d) => d.email)).toEqual(["alerte@exemple.fr"]);
    expect((await destinataires(sql, "hebdomadaire")).map((d) => d.email)).toEqual([]);
    await sql`update profils set frequence = 'hebdomadaire' where compte_id = (select id from comptes where email = 'alerte@exemple.fr')`;
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
    const marche = (id: number, uid: string, objet: string, montant: number, notification: number) => ({
      id, uid, acheteur_siret: ACHETEUR, objet, cpv: "90910000", famille: "services", renouvelable: true,
      montant, date_notification: dansJours(notification), duree_mois: 12, date_fin_estimee: dansJours(notification + 365),
      departement: "69", empreinte: "00000000-0000-0000-0000-000000000000",
    });
    await sql`insert into marches ${sql([
      marche(1001, "G1", "Nettoyage des crèches", 10000, -20),
      marche(1002, "G2", "Nettoyage des crèches", 20000, -20),
      marche(1003, "G3", "Vitrerie", 5000, -800),
    ])}`;
    await sql`insert into marches_titulaires ${sql([1001, 1002, 1003].map((id) => ({
      marche_id: id, titulaire_id: `${CONCURRENT}00055`, type_identifiant: "SIRET",
    })))}`;
    // le BOAMP ne donne que le nom du titulaire, écrit autrement que dans la base Sirene
    await enregistrerAvis(sql, [avis({
      uid: "boamp-26-50", numero: "26-50", type: "attribution", objet: "Nettoyage du collège",
      acheteur_siret: AUTRE_ACHETEUR, acheteur_nom: "Département de l'Ain", date_publication: dansJours(-5),
      date_limite: null, montant: 42000, titulaires: [{ nom: "Sas Propreté du Lyonnais", identifiant: null }],
    })]);

    const compte = (await creerCompte(sql, { email: "concurrents@exemple.fr", siren: "111111111", siret: null, nom: null }))!;
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

describe.skipIf(!locale)("tenir dans l'offre gratuite de Supabase", () => {
  let sql: postgres.Sql;
  const con = DuckDBInstance.create(":memory:").then((instance) => instance.connect());
  const colonnes = "id, acheteur_id, objet, codecpv, nature, procedure, montant, datenotification, dureemois, " +
    "offresrecues, lieuexecution_code, lieuexecution_typecode, source, titulaire_id_1, titulaire_typeidentifiant_1, " +
    "titulaire_id_2, titulaire_typeidentifiant_2, titulaire_id_3, titulaire_typeidentifiant_3";
  const ligne = (id: string, objet: string, montant: number, notification: string, duree: number) =>
    `('${id}', '${ACHETEUR}', '${objet}', '90910000-9', 'Marché', 'MAPA', ${montant}, '${notification}', ${duree}, ` +
    `'2', '69', 'Code département', 'test', '11111111100011', 'SIRET', null, null, null, null)`;
  // dix marchés qui ne bougent pas, un qui sera modifié, un qui disparaîtra, et un trop ancien pour être gardé
  const stables = Array.from({ length: 10 }, (_, i) => ligne(`A${i}`, "Nettoyage", 1000 + i, dansJours(-180), 24));

  async function importer(lignes: string[]) {
    const duck = await con;
    await duck.run(`create or replace table semaine as select * from (values ${lignes.join(", ")}) t(${colonnes})`);
    await duck.run("create or replace table vide as select *, null::varchar as acheteur_nom from semaine limit 0");
    await normaliser(duck, { "2019": "vide", "2022": "semaine" });
    const dossier = await mkdtemp(path.join(tmpdir(), "decp-semaine-"));
    await exporterEnBase(sql, path.join(dossier, "en-base.csv"));
    const fichiers = await exporterCsv(duck, dossier, { enBase: path.join(dossier, "en-base.csv") });
    await chargerDecp(sql, fichiers);
    return fichiers;
  }

  const enBase = () => sql<{ uid: string; id: number; objet: string; titulaires: number }[]>`
    select m.uid, m.id, m.objet, (select count(*)::int from marches_titulaires t where t.marche_id = m.id) as titulaires
    from marches m order by m.uid`;

  beforeAll(() => {
    sql = postgres(url!, { max: 1, onnotice: () => {}, fetch_types: false });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("ne garde que trois ans de marchés, plus ceux encore en cours", async () => {
    // les marchés des tests précédents disparaissent : plus d'un sur cinq, l'import se fait en deux temps
    const fichiers = await importer([
      ...stables,
      ligne("B", "Vitrerie", 2000, dansJours(-180), 24),
      ligne("C", "Espaces verts", 3000, dansJours(-180), 24),
      ligne("ANCIEN", "Nettoyage", 4000, dansJours(-5 * 365), 12),
      ligne("LONG", "Nettoyage", 5000, dansJours(-5 * 365), 120),
    ]);
    expect(fichiers).toMatchObject({ nbAjoutes: 13, nbSupprimes: 7 });
    const marches = await enBase();
    expect(marches.map((m) => m.uid.slice(ACHETEUR.length + 1))).toEqual([
      "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "B", "C", "LONG",
    ]);
    expect(marches.every((m) => m.titulaires === 1)).toBe(true);
  });

  it("ne réécrit que les marchés modifiés, nouveaux ou disparus", async () => {
    const avant = await enBase();
    const fichiers = await importer([
      ...stables,
      ligne("B", "Vitrerie des écoles", 2000, dansJours(-180), 24),
      ligne("D", "Désinfection", 6000, dansJours(-10), 12),
      ligne("LONG", "Nettoyage", 5000, dansJours(-5 * 365), 120),
    ]);
    expect(fichiers).toMatchObject({ nbAjoutes: 2, nbSupprimes: 2 });
    const apres = await enBase();
    const parUid = (lignes: typeof avant) => new Map(lignes.map((m) => [m.uid.slice(ACHETEUR.length + 1), m]));
    const [a, b] = [parUid(avant), parUid(apres)];
    expect([...b.keys()]).toEqual(["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "B", "D", "LONG"]);
    expect(b.get("A0")!.id).toBe(a.get("A0")!.id);
    expect(b.get("B")).toMatchObject({ objet: "Vitrerie des écoles", titulaires: 1 });
    expect(b.get("B")!.id).toBeGreaterThan(Math.max(...avant.map((m) => m.id)));
    const [{ titulaires }] = await sql`select count(*)::int as titulaires from marches_titulaires`;
    expect(titulaires).toBe(13);
  });

  it("supprime les avis de plus de six mois dont la date limite est passée", async () => {
    await enregistrerAvis(sql, [
      avis({ uid: "boamp-25-1", numero: "25-1", date_publication: dansJours(-200), date_limite: null }),
      avis({ uid: "boamp-25-2", numero: "25-2", date_publication: dansJours(-200), date_limite: dansJours(-150) }),
      avis({ uid: "boamp-25-3", numero: "25-3", date_publication: dansJours(-200), date_limite: dansJours(10) }),
      avis({ uid: "boamp-26-9", numero: "26-9", date_publication: dansJours(-100), date_limite: null }),
    ]);
    expect(await purgerAvis(sql)).toBe(2);
    const restants = await sql`select uid from avis where uid in ('boamp-25-1', 'boamp-25-2', 'boamp-25-3', 'boamp-26-9') order by uid`;
    expect(restants.map((r) => r.uid)).toEqual(["boamp-25-3", "boamp-26-9"]);
  });
});
