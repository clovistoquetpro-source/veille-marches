/** Libellés courts des nomenclatures affichées sur les fiches. */

/** Divisions du vocabulaire commun pour les marchés publics (CPV, deux premiers chiffres). */
export const DIVISIONS_CPV: Record<string, string> = {
  "03": "Produits agricoles et de l'élevage",
  "09": "Produits pétroliers, combustibles, électricité",
  "14": "Produits miniers et matériaux",
  "15": "Produits alimentaires et boissons",
  "16": "Machines agricoles",
  "18": "Vêtements, chaussures, bagages",
  "19": "Cuir, textiles, plastiques, caoutchouc",
  "22": "Imprimés et produits connexes",
  "24": "Produits chimiques",
  "30": "Matériel de bureau et informatique",
  "31": "Machines et appareils électriques, éclairage",
  "32": "Équipements de radio, télévision, télécommunication",
  "33": "Matériel médical, pharmaceutique, d'hygiène",
  "34": "Véhicules et équipements de transport",
  "35": "Équipements de sécurité, incendie, défense",
  "37": "Instruments de musique, articles de sport, jeux",
  "38": "Équipements de laboratoire et de précision",
  "39": "Mobilier, aménagement, produits d'entretien",
  "41": "Eau collectée et purifiée",
  "42": "Machines industrielles",
  "43": "Machines pour le bâtiment et l'extraction",
  "44": "Structures et matériaux de construction",
  "45": "Travaux de construction",
  "48": "Logiciels et systèmes d'information",
  "50": "Réparation et maintenance",
  "51": "Installation d'équipements",
  "55": "Hôtellerie et restauration",
  "60": "Transport",
  "63": "Services annexes aux transports, voyages",
  "64": "Postes et télécommunications",
  "65": "Distribution d'eau et d'énergie",
  "66": "Banque, finance et assurance",
  "70": "Services immobiliers",
  "71": "Architecture, ingénierie, contrôle",
  "72": "Services informatiques",
  "73": "Recherche et développement",
  "75": "Administration, défense, sécurité sociale",
  "76": "Services liés à l'industrie pétrolière et gazière",
  "77": "Agriculture, sylviculture, espaces verts",
  "79": "Services aux entreprises (conseil, juridique, communication, sécurité)",
  "80": "Enseignement et formation",
  "85": "Santé et action sociale",
  "90": "Déchets, assainissement, nettoyage, environnement",
  "92": "Loisirs, culture et sport",
  "98": "Autres services collectifs et personnels",
};

export function libelleDivision(cpv: string | null): string {
  return (cpv && DIVISIONS_CPV[cpv.slice(0, 2)]) || "Catégorie inconnue";
}

/** Tranches d'effectif salarié de Sirene. */
const TRANCHES_EFFECTIF: Record<string, string> = {
  "00": "0 salarié", "01": "1 ou 2 salariés", "02": "3 à 5 salariés", "03": "6 à 9 salariés",
  "11": "10 à 19 salariés", "12": "20 à 49 salariés", "21": "50 à 99 salariés", "22": "100 à 199 salariés",
  "31": "200 à 249 salariés", "32": "250 à 499 salariés", "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés", "51": "2 000 à 4 999 salariés", "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};

export function libelleEffectif(tranche: string | null): string | null {
  return tranche ? TRANCHES_EFFECTIF[tranche] ?? null : null;
}

const TYPES_AVIS: Record<string, string> = {
  marche: "Avis de marché",
  attribution: "Attribution",
  preinformation: "Pré-information",
  rectificatif: "Rectificatif",
  annulation: "Annulation",
  modification: "Modification",
  autre: "Autre avis",
};

export function libelleTypeAvis(type: string): string {
  return TYPES_AVIS[type] ?? type;
}
