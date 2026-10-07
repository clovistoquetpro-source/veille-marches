import { strToU8, zipSync } from "fflate";

/**
 * Fabrique un document Word (.docx) très simple : titres, paragraphes, cases à cocher, champs et tableaux.
 * Un .docx n'est qu'une archive zip de quelques fichiers XML ; on l'écrit à la main pour rester léger
 * (pas de bibliothèque lourde à charger sur Cloudflare).
 */
export type Bloc =
  | { type: "titre"; texte: string }
  | { type: "rubrique"; texte: string }
  | { type: "sous-rubrique"; texte: string }
  | { type: "texte"; texte: string; gras?: boolean; note?: boolean }
  /** Libellé suivi de la valeur ; sans valeur, une ligne pointillée à compléter. */
  | { type: "champ"; libelle: string; valeur: string | null }
  | { type: "case"; cochee: boolean; texte: string }
  /** La première ligne est l'en-tête ; avec `libelles`, la première colonne aussi. */
  | { type: "tableau"; lignes: (string | null)[][]; libelles?: boolean };

/** Couleur des informations remplies pour le client, pour qu'il voie d'un coup d'œil ce qui est à vérifier. */
const BLEU = "1F3A93";
const GRIS = "595959";
const POINTILLES = "……………………………………………………………………";

export function echapperXml(texte: string): string {
  return texte
    // caractères de contrôle interdits en XML (hors tabulation et retours à la ligne)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Style = { gras?: boolean; italique?: boolean; couleur?: string; taille?: number };

function run(texte: string, { gras, italique, couleur, taille }: Style = {}): string {
  const proprietes = [
    gras && "<w:b/>",
    italique && "<w:i/>",
    couleur && `<w:color w:val="${couleur}"/>`,
    taille && `<w:sz w:val="${taille}"/><w:szCs w:val="${taille}"/>`,
  ].filter(Boolean).join("");
  // les retours à la ligne du texte deviennent des sauts de ligne Word
  const contenu = texte.split("\n").map((ligne) => `<w:t xml:space="preserve">${echapperXml(ligne)}</w:t>`).join("<w:br/>");
  return `<w:r>${proprietes ? `<w:rPr>${proprietes}</w:rPr>` : ""}${contenu}</w:r>`;
}

function paragraphe(runs: string, { avant = 0, apres = 80, centre = false, fond, retrait }: {
  avant?: number; apres?: number; centre?: boolean; fond?: string; retrait?: number;
} = {}): string {
  const proprietes = [
    `<w:spacing w:before="${avant}" w:after="${apres}"/>`,
    retrait && `<w:ind w:left="${retrait}"/>`,
    fond && `<w:shd w:val="clear" w:color="auto" w:fill="${fond}"/>`,
    centre && `<w:jc w:val="center"/>`,
  ].filter(Boolean).join("");
  return `<w:p><w:pPr>${proprietes}</w:pPr>${runs}</w:p>`;
}

function cellule(texte: string | null, largeur: number): string {
  const contenu = texte === null ? run(" ") : run(texte, { couleur: BLEU });
  return `<w:tc><w:tcPr><w:tcW w:w="${largeur}" w:type="dxa"/></w:tcPr>${paragraphe(contenu, { apres: 40 })}</w:tc>`;
}

function tableau(lignes: (string | null)[][], libelles = false): string {
  const colonnes = Math.max(...lignes.map((l) => l.length));
  const largeur = Math.floor(9000 / colonnes);
  const bordure = (cote: string) => `<w:${cote} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const bordures = ["top", "left", "bottom", "right", "insideH", "insideV"].map(bordure).join("");
  const grille = Array.from({ length: colonnes }, () => `<w:gridCol w:w="${largeur}"/>`).join("");
  const corps = lignes.map((ligne, i) => `<w:tr>${ligne.map((texte, j) =>
    // les en-têtes sont écrits en noir sur fond gris, les valeurs en bleu
    (i === 0 || (libelles && j === 0)) && texte !== null
      ? `<w:tc><w:tcPr><w:tcW w:w="${largeur}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="EDEDED"/></w:tcPr>${paragraphe(run(texte, { gras: true }), { apres: 40 })}</w:tc>`
      : cellule(texte, largeur)).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${largeur * colonnes}" w:type="dxa"/><w:tblBorders>${bordures}</w:tblBorders></w:tblPr><w:tblGrid>${grille}</w:tblGrid>${corps}</w:tbl>${paragraphe("", { apres: 40 })}`;
}

function xmlDuBloc(bloc: Bloc): string {
  switch (bloc.type) {
    case "titre":
      return paragraphe(run(bloc.texte, { gras: true, taille: 28 }), { centre: true, apres: 120 });
    case "rubrique":
      return paragraphe(run(bloc.texte, { gras: true, taille: 22 }), { avant: 240, apres: 80, fond: "E7EAF6" });
    case "sous-rubrique":
      return paragraphe(run(bloc.texte, { gras: true }), { avant: 160, apres: 60 });
    case "texte":
      return paragraphe(run(bloc.texte, bloc.note ? { italique: true, couleur: GRIS, taille: 16 } : { gras: bloc.gras }));
    case "champ":
      return paragraphe(
        run(`${bloc.libelle} : `) + (bloc.valeur ? run(bloc.valeur, { couleur: BLEU }) : run(POINTILLES, { couleur: GRIS })),
        { retrait: 284 },
      );
    case "case":
      return paragraphe(
        run(bloc.cochee ? "☒ " : "☐ ", { couleur: bloc.cochee ? BLEU : undefined, taille: 22 }) + run(bloc.texte),
        { retrait: 284 },
      );
    case "tableau":
      return tableau(bloc.lignes, bloc.libelles);
  }
}

const ESPACES = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};

/** Construit le fichier .docx ; `pied` est répété en bas de chaque page. */
export function documentWord(blocs: Bloc[], pied: string): Uint8Array {
  const corps = blocs.map(xmlDuBloc).join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${ESPACES.w}" xmlns:r="${ESPACES.r}"><w:body>${corps}<w:sectPr><w:footerReference w:type="default" r:id="rPied"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const piedDePage = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${ESPACES.w}">${paragraphe(
    // le numéro de page est un champ que Word recalcule ; « 1 » n'est que sa valeur avant calcul
    run(`${pied} · Page `, { couleur: GRIS, taille: 16 })
      + `<w:fldSimple w:instr="PAGE">${run("1", { couleur: GRIS, taille: 16 })}</w:fldSimple>`,
    { centre: true, apres: 0 },
  )}</w:ftr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${ESPACES.w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
  const fichiers: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rPied" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    "word/document.xml": document,
    "word/styles.xml": styles,
    "word/footer1.xml": piedDePage,
  };
  return zipSync(Object.fromEntries(Object.entries(fichiers).map(([nom, xml]) => [nom, strToU8(xml)])));
}
