import { describe, expect, it } from "vitest";
import { zipFile } from "../test/zip";
import { extractSections, OfficeError, officeKind } from "./office";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const RELS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';

const para = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;

/** A German Word file: localised style ids, their built-in names in styles.xml. */
function word(body: string, withStyles = true) {
  const entries: Record<string, string> = {
    "word/document.xml": `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
  };
  if (withStyles) {
    entries["word/styles.xml"] = `<?xml version="1.0"?><w:styles ${W}>
      <w:style w:styleId="berschrift1"><w:name w:val="heading 1"/></w:style>
      <w:style w:styleId="berschrift3"><w:name w:val="heading 3"/></w:style>
      <w:style w:styleId="Titel"><w:name w:val="Title"/></w:style>
      <w:style w:styleId="Kapitel"><w:name w:val="Kapitel"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
    </w:styles>`;
  }
  return entries;
}

async function sectionsOf(name: string, entries: Record<string, string>, options = {}) {
  return extractSections(await zipFile(name, entries, options));
}

describe("the zip reader", () => {
  it("reads stored and deflated entries, also with sizes only in the data descriptor", async () => {
    const entries = word(para("Bern ist die Hauptstadt."));
    for (const options of [{ deflate: false }, { deflate: true }, { deflate: true, descriptor: true }]) {
      expect(await sectionsOf("a.docx", entries, options)).toEqual([
        { n: 1, label: "Bern ist die Hauptstadt.", text: "Bern ist die Hauptstadt." },
      ]);
    }
  });

  it("knows the kinds by name, refuses old and foreign files and damaged ones", async () => {
    expect(officeKind("Vorlesung.DOCX")).toBe("docx");
    expect(officeKind("a.ppt")).toBe("old");
    expect(officeKind("a.pdf")).toBeNull();
    const code = (file: File) => extractSections(file).catch((err: unknown) => (err as OfficeError).code);
    expect(await code(new File(["x"], "old.doc"))).toBe("old_format");
    expect(await code(new File(["x"], "notes.txt"))).toBe("unsupported");
    expect(await code(new File(["not a zip at all, no"], "broken.docx"))).toBe("unreadable");
    expect(await code(await zipFile("empty.docx", { "other.xml": "<a/>" }))).toBe("unreadable");
    expect(await code(await zipFile("bad.docx", { "word/document.xml": "<w:document" }))).toBe("unreadable");
  });
});

describe("Word", () => {
  it("a section per heading 1/2 or title; text before the first heading has its own", async () => {
    const body = [
      para("Vorwort zum Kurs"),
      para("Die Schweiz", "Titel"),
      para("Ein Land in Europa."),
      para("Kantone", "berschrift1"),
      para("Es gibt 26 Kantone."),
      para("Klein", "berschrift3"), // level 3: stays in its section
      para("Basel-Stadt ist klein."),
      para("Sprachen", "Kapitel"), // outline level 1 = heading 2
      `<w:tbl><w:tr><w:tc>${para("Deutsch")}</w:tc><w:tc>${para("62 %")}</w:tc></w:tr></w:tbl>`,
      `<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>`,
    ].join("");
    expect(await sectionsOf("kurs.docx", word(body))).toEqual([
      { n: 1, label: "Vorwort zum Kurs", text: "Vorwort zum Kurs" },
      { n: 2, label: "Die Schweiz", text: "Die Schweiz\nEin Land in Europa." },
      { n: 3, label: "Kantone", text: "Kantone\nEs gibt 26 Kantone.\nKlein\nBasel-Stadt ist klein." },
      { n: 4, label: "Sprachen", text: "Sprachen\nDeutsch | 62 %\na\tb\nc" },
    ]);
  });

  it("reads the text inside content controls too (templates, cover pages)", async () => {
    const body = `<w:sdt><w:sdtPr/><w:sdtContent>${para("Deckblatt")}<w:sdt><w:sdtContent>${para(
      "Kantone",
      "berschrift1",
    )}</w:sdtContent></w:sdt></w:sdtContent></w:sdt>${para("Es gibt 26 Kantone.")}`;
    expect(await sectionsOf("vorlage.docx", word(body))).toEqual([
      { n: 1, label: "Deckblatt", text: "Deckblatt" },
      { n: 2, label: "Kantone", text: "Kantone\nEs gibt 26 Kantone." },
    ]);
  });

  it("without styles.xml, headings are guessed from the style id; long sections are split", async () => {
    const long = "Wort ".repeat(1000).trim(); // 4,999 characters
    const body = [para("Teil", "Heading2"), para(long), para(long)].join("");
    const sections = await sectionsOf("long.docx", word(body, false));
    expect(sections.map((s) => [s.n, s.label])).toEqual([
      [1, "Teil"],
      [2, "Teil (2)"],
    ]);
    expect(sections[1]!.text).toBe(long);
  });
});

describe("PowerPoint", () => {
  const slide = (shapes: string) =>
    `<?xml version="1.0"?><p:sld ${P} ${A}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;
  const shape = (texts: string[], type?: string) =>
    `<p:sp><p:nvSpPr><p:nvPr>${type ? `<p:ph type="${type}"/>` : ""}</p:nvPr></p:nvSpPr><p:txBody>${texts
      .map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`)
      .join("")}</p:txBody></p:sp>`;

  it("a section per slide in show order, titled, numbered like the slides; empty slides are left out", async () => {
    const entries = {
      "ppt/presentation.xml": `<?xml version="1.0"?><p:presentation ${P} ${R}><p:sldIdLst>
        <p:sldId r:id="rId3"/><p:sldId r:id="rId2"/><p:sldId r:id="rId4"/></p:sldIdLst></p:presentation>`,
      "ppt/_rels/presentation.xml.rels": `<?xml version="1.0"?><Relationships ${RELS}>
        <Relationship Id="rId2" Target="slides/slide1.xml"/>
        <Relationship Id="rId3" Target="/ppt/slides/slide2.xml"/>
        <Relationship Id="rId4" Target="slides/slide3.xml"/></Relationships>`,
      "ppt/slides/slide1.xml": slide(
        shape(["Fotosynthese"], "title") +
          `<p:graphicFrame><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Licht</a:t></a:r></a:p></a:txBody></a:tc>` +
          `<a:tc><a:txBody><a:p><a:r><a:t>Energie</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></p:graphicFrame>`,
      ),
      "ppt/slides/slide2.xml": slide(shape(["Zellen haben einen Kern."])),
      "ppt/slides/slide3.xml": slide(shape([""])),
    };
    expect(await sectionsOf("bio.pptx", entries)).toEqual([
      { n: 1, label: "Zellen haben einen Kern.", text: "Zellen haben einen Kern." },
      { n: 2, label: "Fotosynthese", text: "Fotosynthese\nLicht | Energie" },
    ]);
  });
});

describe("Excel", () => {
  it("a section per sheet, each row a line; shared, inline, number and boolean cells", async () => {
    const entries = {
      "xl/workbook.xml": `<?xml version="1.0"?><workbook ${S} ${R}><sheets>
        <sheet name="Vokabeln" r:id="rId1"/><sheet name="Leer" r:id="rId9"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships ${RELS}>
        <Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<?xml version="1.0"?><sst ${S}><si><t>el perro</t></si><si><r><t>the </t></r><r><t>dog</t></r></si></sst>`,
      "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet ${S}><sheetData>
        <row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>
        <row><c t="inlineStr"><is><t>Anzahl</t></is></c><c><v>26</v></c><c t="b"><v>1</v></c><c/></row>
        </sheetData></worksheet>`,
    };
    expect(await sectionsOf("vokabeln.xlsx", entries)).toEqual([
      { n: 1, label: "Vokabeln", text: "el perro | the dog\nAnzahl | 26 | TRUE" },
    ]);
  });
});
