import express from "express";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as storage from "./storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const usePostgres = Boolean(process.env.DATABASE_URL?.trim());

export function registerCeRoutes(app) {
  const baseDir = resolve(__dirname, "..", "ce");
  const dbPath = process.env.CE_DB_PATH || resolve(baseDir, "db", "ce.sqlite");
  const schemaPath = process.env.CE_SCHEMA_PATH || resolve(baseDir, "db", "schema.sql");
  const pdfDir = process.env.CE_PDF_DIR || resolve(baseDir, "pdfs");
  const templatesDir = process.env.CE_TEMPLATES_DIR || resolve(baseDir, "templates");
  const motorintygTemplatePath =
    process.env.CE_MOTORINTYG_TEMPLATE || resolve(templatesDir, "motorintyg", "motorintyg.html");
  const motorintygAssetsDir =
    process.env.CE_MOTORINTYG_ASSETS || resolve(templatesDir, "motorintyg", "assets");
  const ceTemplatePath = process.env.CE_CE_TEMPLATE || resolve(templatesDir, "ce", "ce.html");
  const ceAssetsDir = process.env.CE_CE_ASSETS || resolve(templatesDir, "ce", "assets");
  const shouldGeneratePlaceholders = process.env.CE_GENERATE_PLACEHOLDER_PDFS !== "0";
  const shouldGenerateMotorintyg = process.env.CE_GENERATE_MOTORINTYG_PDFS !== "0";
  const shouldGenerateCe = process.env.CE_GENERATE_CE_PDFS !== "0";

  if (!storage.useSpacesStorage()) {
    mkdirSync(pdfDir, { recursive: true });
  }
  mkdirSync(motorintygAssetsDir, { recursive: true });
  mkdirSync(ceAssetsDir, { recursive: true });

  let ceDb = null;
  if (!usePostgres) {
    ceDb = new DatabaseSync(dbPath);
    ceDb.exec("PRAGMA foreign_keys = ON;");
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, "utf8");
      ceDb.exec(schema);
    }
  }

  const queries = {
    searchProducts:
      "SELECT MAX(modell) AS modell, TRIM(serienummer) AS serienummer, MAX(motornummer) AS motornummer FROM ce_products WHERE TRIM(serienummer) LIKE ? GROUP BY TRIM(serienummer) ORDER BY TRIM(serienummer) LIMIT 200",
    getProduct: "SELECT * FROM ce_products WHERE TRIM(serienummer) = ? ORDER BY updated_at DESC LIMIT 1",
    listModelNames: "SELECT modellNamn FROM ce_models ORDER BY modellNamn",
    createProduct: "INSERT INTO ce_products (serienummer) VALUES (?)",
    deleteProduct: "DELETE FROM ce_products WHERE serienummer = ?",
    updateProduct: `UPDATE ce_products SET
        modell = ?,
        motornummer = ?,
        tillverkningsar = ?,
        godkand_av = ?,
        maskinslag_ce = ?,
        maskinslag = ?,
        fabrikat = ?,
        motorfabrikat = ?,
        motoreffekt = ?,
        motorvolym = ?,
        uppfyller_avgaskrav = ?,
        certifikat_nummer = ?,
        rek_bransle = ?,
        originalmotor = ?,
        hyudralolja = ?,
        harmoniserande_standarder = ?,
        enligt_villkoren_i_direktiv = ?,
        anmalt_organ_for_direktiv = ?,
        uppmatt_ljudeffektniva = ?,
        garanterad_ljud_och_effektniva = ?,
        namn_och_underskrift = ?,
        is_dynapac_ce = ?,
        maskin_marke = ?,
        updated_at = datetime('now')
      WHERE serienummer = ?`,
    listModels: "SELECT modellNamn, created_for_ce_search FROM ce_models ORDER BY modellNamn",
    getModel: "SELECT * FROM ce_models WHERE modellNamn = ?",
    createModel: "INSERT INTO ce_models (modellNamn) VALUES (?)",
    deleteModel: "DELETE FROM ce_models WHERE modellNamn = ?",
    updateModel: `UPDATE ce_models SET
        maskinslag_ce = ?,
        maskinslag = ?,
        fabrikat = ?,
        motorfabrikat = ?,
        motoreffekt = ?,
        motorvolym = ?,
        uppfyller_avgaskrav = ?,
        certifikat_nummer = ?,
        rek_bransle = ?,
        originalmotor = ?,
        hyudralolja = ?,
        harmoniserande_standarder = ?,
        enligt_villkoren_i_direktiv = ?,
        anmalt_organ_for_direktiv = ?,
        uppmatt_ljudeffektniva = ?,
        garanterad_ljud_och_effektniva = ?,
        namn_och_underskrift = ?,
        is_dynapac_ce = ?,
        maskin_marke = ?,
        updated_at = datetime('now')
      WHERE modellNamn = ?`
  };

  async function ceQueryAll(sql, params = []) {
    if (usePostgres) {
      const { queryAll } = await import("./db.js");
      return queryAll(sql, params);
    }
    return ceDb.prepare(sql).all(...params);
  }

  async function ceQueryGet(sql, params = []) {
    if (usePostgres) {
      const { queryGet } = await import("./db.js");
      return queryGet(sql, params);
    }
    return ceDb.prepare(sql).get(...params) ?? null;
  }

  async function ceQueryRun(sql, params = []) {
    if (usePostgres) {
      const { queryRun } = await import("./db.js");
      return queryRun(sql, params);
    }
    return ceDb.prepare(sql).run(...params);
  }

  function ensureText(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }

  function ensureFlag(value) {
    if (value === true || value === "1" || value === 1) {
      return 1;
    }
    return 0;
  }

  function escapeHtml(value) {
    const text = ensureText(value);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderTemplate(template, data) {
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        return data[key];
      }
      return match;
    });
  }

  function readMotorintygTemplate() {
    if (!existsSync(motorintygTemplatePath)) {
      return "";
    }
    return readFileSync(motorintygTemplatePath, "utf8");
  }

  function readCeTemplate() {
    if (!existsSync(ceTemplatePath)) {
      return "";
    }
    return readFileSync(ceTemplatePath, "utf8");
  }

  function dataUriFor(path) {
    if (!existsSync(path)) {
      return "";
    }
    const ext = extname(path).toLowerCase();
    let mimeType = "application/octet-stream";
    if (ext === ".png") {
      mimeType = "image/png";
    } else if (ext === ".jpg" || ext === ".jpeg") {
      mimeType = "image/jpeg";
    }
    const data = readFileSync(path).toString("base64");
    return `data:${mimeType};base64,${data}`;
  }

  function buildMotorintygBlocks(data) {
    const logoStyle = data.isDynapac ? "opacity: 0;" : "";
    const logoBlock = `<img class=\"swepac-logo\" style=\"${logoStyle}\" src=\"${data.swepacLogoUrl}\" />`;

    let introBlock = "";
    if (data.isDynapac) {
      introBlock =
        "<p><span style=\"opacity: 0;\">" +
        "Maskinen &auml;r monterad enligt monteringsinstruktion I 1101<br /><br />" +
        `Godk&auml;nd av: ${data.godkandAv}<br /><br /></span>` +
        "P&aring; nedanst&aring;ende beskrivna maskin har vi originalmonterat alternativt ersatt befintlig " +
        "f&ouml;rbr&auml;nningsmotor.</p>";
    } else {
      introBlock =
        "<p>" +
        "Maskinen &auml;r monterad enligt monteringsinstruktion I 1101<br /><br />" +
        `Godk&auml;nd av: ${data.godkandAv}<br /><br />` +
        "P&aring; nedanst&aring;ende beskrivna maskin har vi originalmonterat alternativt ersatt befintlig " +
        "f&ouml;rbr&auml;nningsmotor.</p>";
    }

    let footerBlock = "";
    if (data.isDynapac) {
      footerBlock =
        "<p>Dynapac GmbH<br />" +
        "Ammerl&auml;nder Str. 93<br />" +
        "26203 Wardenburg - Germany<br /><br /><br />" +
        `Ort och datum: Wardenburg, ${data.datum}<br /><br /><br />` +
        "<span class=\"signature-name-text\">Namn:</span><br />" +
        `<img src=\"${data.dynapacSignatureUrl}\" class=\"document-signature-image document-signature-image-dynapac\" />` +
        "<br /><br />Namnf&ouml;rtydligande: Thorsten Bode</p>";
    } else {
      footerBlock =
        "<p>Swepac AB<br />" +
        "Bergv&auml;gen 7<br />" +
        "341 32 Ljungby<br />" +
        "Telefon: 0372-156 00<br />" +
        "E-post: mail@swepac.se<br /><br />" +
        `Ort och datum: Ljungby, ${data.datum}<br /><br /><br />` +
        "<span class=\"signature-name-text\">Namn:</span><br />" +
        `<img src=\"${data.swepacSignatureUrl}\" class=\"document-signature-image\" />` +
        "<br /><br />Namnf&ouml;rtydligande: Anders Johansson</p>";
    }

    let originalBlock = "<tr><td class=\"grey-gb\">Originalmotor</td>";
    if (data.originalmotor === "JA") {
      originalBlock +=
        "<td width=\"15%\" class=\"grey-gb\">Ja</td>" +
        "<td width=\"15%\" style=\"text-align: center;\">X</td>" +
        "<td width=\"15%\" class=\"grey-gb\">Nej</td>" +
        "<td width=\"15%\" style=\"text-align: center;\"></td>";
    } else if (data.originalmotor === "NEJ") {
      originalBlock +=
        "<td width=\"15%\" class=\"grey-gb\">Ja</td>" +
        "<td width=\"15%\" style=\"text-align: center;\"></td>" +
        "<td width=\"15%\" class=\"grey-gb\">Nej</td>" +
        "<td width=\"15%\" style=\"text-align: center;\">X</td>";
    } else {
      originalBlock +=
        "<td width=\"15%\" class=\"grey-gb\">Ja</td>" +
        "<td width=\"15%\" style=\"text-align: center;\"></td>" +
        "<td width=\"15%\" class=\"grey-gb\">Nej</td>" +
        "<td width=\"15%\" style=\"text-align: center;\"></td>";
    }
    originalBlock += "</tr>";

    return { logoBlock, introBlock, footerBlock, originalBlock };
  }

  async function buildMotorintygData(serial) {
    const product = await ceQueryGet(queries.getProduct, [serial]);
    if (!product) {
      return null;
    }
    const isDynapac = ensureFlag(product.is_dynapac_ce) === 1;
    const tillverkningsar = ensureText(product.tillverkningsar);
    const year = tillverkningsar ? tillverkningsar.slice(0, 4) : "";
    const datum = tillverkningsar;

    const data = {
      serienummer: escapeHtml(product.serienummer),
      motornummer: escapeHtml(product.motornummer),
      modell: escapeHtml(product.modell),
      maskinslag: escapeHtml(product.maskinslag),
      motorfabrikat: escapeHtml(product.motorfabrikat),
      motoreffekt: escapeHtml(product.motoreffekt),
      motorvolym: escapeHtml(product.motorvolym),
      uppfyller_avgaskrav: escapeHtml(product.uppfyller_avgaskrav),
      certifikat_nummer: escapeHtml(product.certifikat_nummer),
      rek_bransle: escapeHtml(product.rek_bransle),
      hyudralolja: escapeHtml(product.hyudralolja),
      tillverkningsar: escapeHtml(year),
      datum: escapeHtml(datum),
      godkandAv: escapeHtml(product.godkand_av),
      originalmotor: ensureText(product.originalmotor).toUpperCase(),
      isDynapac,
      swepacLogoUrl: dataUriFor(resolve(motorintygAssetsDir, "swepac-logo.png")),
      swepacSignatureUrl: dataUriFor(resolve(motorintygAssetsDir, "document-signature.png")),
      dynapacSignatureUrl: dataUriFor(resolve(motorintygAssetsDir, "dynapac-signature.png"))
    };

    const blocks = buildMotorintygBlocks({
      ...data,
      godkandAv: data.godkandAv || "",
      datum: data.datum || "",
      originalmotor: data.originalmotor
    });

    return {
      ...data,
      logo_block: blocks.logoBlock,
      intro_block: blocks.introBlock,
      footer_block: blocks.footerBlock,
      originalmotor_block: blocks.originalBlock
    };
  }

  async function generateMotorintygPdf(serial) {
    const template = readMotorintygTemplate();
    if (!template) throw new Error("Motorintyg template not found");
    const data = await buildMotorintygData(serial);
    if (!data) throw new Error("Product not found");
    const html = renderTemplate(template, data);
    const key = `motorintyg-${serial}.pdf`;

    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 1131 } });
      await page.setContent(html, { waitUntil: "load" });
      const pdfBytes = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", bottom: "0", left: "0", right: "0" }
      });
      await storage.put("ce-pdfs", key, Buffer.from(pdfBytes));
    } finally {
      await browser.close();
    }
    return key;
  }

  function buildCeBlocks(data) {
    const supplierBlock = data.isDynapac
      ? "Dynapac GmbH<br />Ammerl&auml;nder Str. 93<br />26203 Wardenburg - Germany"
      : "Swepac AB<br />Bergv&auml;gen 7<br />S-341 32 Ljungby";

    const placeAndDate = data.isDynapac ? `Wardenburg, ${data.datum}` : `Ljungby, ${data.datum}`;

    const signatureClass = data.isDynapac ? "signature-image signature-image-dynapac" : "signature-image";
    const signatureBlock = `<img src=\"${data.signatureUrl}\" class=\"${signatureClass}\" />`;

    return { supplierBlock, placeAndDate, signatureBlock };
  }

  async function buildCeData(serial) {
    const product = await ceQueryGet(queries.getProduct, [serial]);
    if (!product) {
      return null;
    }
    const isDynapac = ensureFlag(product.is_dynapac_ce) === 1;
    const datum = ensureText(product.tillverkningsar);

    const data = {
      maskin_marke: escapeHtml(product.maskin_marke),
      modell: escapeHtml(product.modell),
      serienummer: escapeHtml(product.serienummer),
      motornummer: escapeHtml(product.motornummer),
      motoreffekt: escapeHtml(product.motoreffekt),
      harmoniserande_standarder: escapeHtml(product.harmoniserande_standarder),
      enligt_villkoren_i_direktiv: escapeHtml(product.enligt_villkoren_i_direktiv),
      anmalt_organ_for_direktiv: escapeHtml(product.anmalt_organ_for_direktiv),
      uppmatt_ljudeffektniva: escapeHtml(product.uppmatt_ljudeffektniva),
      garanterad_ljud_och_effektniva: escapeHtml(product.garanterad_ljud_och_effektniva),
      namn_och_underskrift: escapeHtml(product.namn_och_underskrift),
      datum: escapeHtml(datum),
      isDynapac,
      ceLogoUrl: dataUriFor(resolve(ceAssetsDir, "ce-logo.png")),
      swepacSignatureUrl: dataUriFor(resolve(ceAssetsDir, "signature-image.png")),
      dynapacSignatureUrl: dataUriFor(resolve(ceAssetsDir, "dynapac-signature.png"))
    };

    const blocks = buildCeBlocks({
      ...data,
      signatureUrl: isDynapac ? data.dynapacSignatureUrl : data.swepacSignatureUrl
    });

    return {
      ...data,
      ce_logo_url: data.ceLogoUrl,
      supplier_block: blocks.supplierBlock,
      place_and_date: blocks.placeAndDate,
      signature_block: blocks.signatureBlock
    };
  }

  async function generateCePdf(serial) {
    const template = readCeTemplate();
    if (!template) throw new Error("CE template not found");
    const data = await buildCeData(serial);
    if (!data) throw new Error("Product not found");
    const html = renderTemplate(template, data);
    const key = `ce-${serial}.pdf`;

    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1122, height: 793 } });
      await page.setContent(html, { waitUntil: "load" });
      const pdfBytes = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "0", bottom: "0", left: "0", right: "0" }
      });
      await storage.put("ce-pdfs", key, Buffer.from(pdfBytes));
    } finally {
      await browser.close();
    }
    return key;
  }

  function buildProductPayload(body) {
    return {
      modell: ensureText(body.modell),
      motornummer: ensureText(body.motornummer),
      tillverkningsar: ensureText(body.tillverkningsar),
      godkand_av: ensureText(body.godkand_av),
      maskinslag_ce: ensureText(body.maskinslag_ce),
      maskinslag: ensureText(body.maskinslag),
      fabrikat: ensureText(body.fabrikat),
      motorfabrikat: ensureText(body.motorfabrikat),
      motoreffekt: ensureText(body.motoreffekt),
      motorvolym: ensureText(body.motorvolym),
      uppfyller_avgaskrav: ensureText(body.uppfyller_avgaskrav),
      certifikat_nummer: ensureText(body.certifikat_nummer),
      rek_bransle: ensureText(body.rek_bransle),
      originalmotor: ensureText(body.originalmotor),
      hyudralolja: ensureText(body.hyudralolja),
      harmoniserande_standarder: ensureText(body.harmoniserande_standarder),
      enligt_villkoren_i_direktiv: ensureText(body.enligt_villkoren_i_direktiv),
      anmalt_organ_for_direktiv: ensureText(body.anmalt_organ_for_direktiv),
      uppmatt_ljudeffektniva: ensureText(body.uppmatt_ljudeffektniva),
      garanterad_ljud_och_effektniva: ensureText(body.garanterad_ljud_och_effektniva),
      namn_och_underskrift: ensureText(body.namn_och_underskrift),
      is_dynapac_ce: ensureFlag(body.is_dynapac_ce),
      maskin_marke: ensureText(body.maskin_marke)
    };
  }

  function buildModelPayload(body) {
    return {
      maskinslag_ce: ensureText(body.maskinslag_ce),
      maskinslag: ensureText(body.maskinslag),
      fabrikat: ensureText(body.fabrikat),
      motorfabrikat: ensureText(body.motorfabrikat),
      motoreffekt: ensureText(body.motoreffekt),
      motorvolym: ensureText(body.motorvolym),
      uppfyller_avgaskrav: ensureText(body.uppfyller_avgaskrav),
      certifikat_nummer: ensureText(body.certifikat_nummer),
      rek_bransle: ensureText(body.rek_bransle),
      originalmotor: ensureText(body.originalmotor),
      hyudralolja: ensureText(body.hyudralolja),
      harmoniserande_standarder: ensureText(body.harmoniserande_standarder),
      enligt_villkoren_i_direktiv: ensureText(body.enligt_villkoren_i_direktiv),
      anmalt_organ_for_direktiv: ensureText(body.anmalt_organ_for_direktiv),
      uppmatt_ljudeffektniva: ensureText(body.uppmatt_ljudeffektniva),
      garanterad_ljud_och_effektniva: ensureText(body.garanterad_ljud_och_effektniva),
      namn_och_underskrift: ensureText(body.namn_och_underskrift),
      is_dynapac_ce: ensureFlag(body.is_dynapac_ce),
      maskin_marke: ensureText(body.maskin_marke)
    };
  }

  async function writePlaceholderPdf({ title, serial, key }) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const mono = await pdfDoc.embedFont(StandardFonts.Courier);
    page.drawText(title, { x: 48, y: 770, size: 32, font });
    page.drawText(`Serial: ${serial}`, { x: 48, y: 720, size: 16, font: mono });
    page.drawText("Placeholder document", { x: 48, y: 690, size: 12, font: mono });
    const pdfBytes = await pdfDoc.save();
    await storage.put("ce-pdfs", key, pdfBytes);
  }

  async function canonicalizeSerial(rawSerial) {
    const serial = ensureText(rawSerial).trim();
    if (!serial) {
      return "";
    }
    const variants = await ceQueryAll("SELECT serienummer FROM ce_products WHERE TRIM(serienummer) = ?", [serial]);
    if (variants.length === 0) {
      return serial;
    }
    const hasExact = variants.some((row) => row.serienummer === serial);
    if (!hasExact && variants[0]?.serienummer) {
      await ceQueryRun("UPDATE ce_products SET serienummer = ? WHERE serienummer = ?", [serial, variants[0].serienummer]);
    }
    for (const row of variants) {
      if (row.serienummer !== serial) {
        await ceQueryRun("DELETE FROM ce_products WHERE serienummer = ?", [row.serienummer]);
      }
    }
    return serial;
  }

  async function ensurePlaceholderPdfs(serial) {
    if (!serial || !shouldGeneratePlaceholders) return;
    const ceKey = `ce-${serial}.pdf`;
    const motorintygKey = `motorintyg-${serial}.pdf`;
    if (!(await storage.exists("ce-pdfs", ceKey)) && !shouldGenerateCe) {
      await writePlaceholderPdf({ title: "CE DOCUMENT", serial, key: ceKey });
    }
    if (!(await storage.exists("ce-pdfs", motorintygKey)) && !shouldGenerateMotorintyg) {
      await writePlaceholderPdf({ title: "MOTORINTYG", serial, key: motorintygKey });
    }
  }

  const router = express.Router();
  router.use(express.json());
  router.use(express.urlencoded({ extended: false }));

  router.get("/", (req, res) => {
    res.json({ ok: true, dbPath });
  });

  router.post("/ce-och-motorintyg-products-search", async (req, res) => {
    try {
      const searchText = ensureText(req.body?.serienummerText).trim();
      if (!searchText) {
        res.json([]);
        return;
      }
      const results = await ceQueryAll(queries.searchProducts, [`%${searchText}%`]);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.get("/get-single-ce-och-motorintyg-product/:serial", async (req, res) => {
    try {
      const serial = await canonicalizeSerial(req.params.serial);
      const item = serial ? await ceQueryGet(queries.getProduct, [serial]) : null;
      const modelNames = await ceQueryAll(queries.listModelNames);
      res.json({
        databaseResults: item ? [item] : [],
        availableModelNames: modelNames
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/create-new-ce-och-motorintyg-product", async (req, res) => {
    try {
      const serial = await canonicalizeSerial(req.body?.serienummer);
      if (!serial) {
        res.json(false);
        return;
      }
      const existing = await ceQueryGet(queries.getProduct, [serial]);
      if (existing) {
        res.json(false);
        return;
      }
      await ceQueryRun(queries.createProduct, [serial]);
      res.json(true);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/save-ce-och-motorintyg-product", async (req, res) => {
    try {
      const serial = await canonicalizeSerial(req.body?.serienummer);
      if (!serial) {
        res.json(false);
        return;
      }
      const payload = buildProductPayload(req.body || {});
      const existing = await ceQueryGet(queries.getProduct, [serial]);
      if (!existing) {
        await ceQueryRun(queries.createProduct, [serial]);
      }
      await ceQueryRun(queries.updateProduct, [
        payload.modell,
        payload.motornummer,
        payload.tillverkningsar,
        payload.godkand_av,
        payload.maskinslag_ce,
        payload.maskinslag,
        payload.fabrikat,
        payload.motorfabrikat,
        payload.motoreffekt,
        payload.motorvolym,
        payload.uppfyller_avgaskrav,
        payload.certifikat_nummer,
        payload.rek_bransle,
        payload.originalmotor,
        payload.hyudralolja,
        payload.harmoniserande_standarder,
        payload.enligt_villkoren_i_direktiv,
        payload.anmalt_organ_for_direktiv,
        payload.uppmatt_ljudeffektniva,
        payload.garanterad_ljud_och_effektniva,
        payload.namn_och_underskrift,
        payload.is_dynapac_ce,
        payload.maskin_marke,
        serial
      ]);
      try {
        if (shouldGenerateMotorintyg) {
          await generateMotorintygPdf(serial);
        }
        if (shouldGenerateCe) {
          await generateCePdf(serial);
        }
        await ensurePlaceholderPdfs(serial);
      } catch (error) {
        console.warn("PDF placeholder generation failed:", error.message || error);
      }
      res.json(true);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/delete-ce-och-motorintyg-product", async (req, res) => {
    try {
      const serial = await canonicalizeSerial(req.body?.serienummer);
      if (!serial) {
        res.json(false);
        return;
      }
      await ceQueryRun(queries.deleteProduct, [serial]);
      const ceKey = `ce-${serial}.pdf`;
      const motorintygKey = `motorintyg-${serial}.pdf`;
      if (await storage.exists("ce-pdfs", ceKey)) await storage.remove("ce-pdfs", ceKey);
      if (await storage.exists("ce-pdfs", motorintygKey)) await storage.remove("ce-pdfs", motorintygKey);
      res.json(true);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.get("/get-all-ce-och-motorintyg-models", async (req, res) => {
    try {
      const results = await ceQueryAll(queries.listModels);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/get-single-ce-och-motorintyg-model", async (req, res) => {
    try {
      const name = ensureText(req.body?.modellNamn).trim();
      if (!name) {
        res.json(null);
        return;
      }
      const result = await ceQueryGet(queries.getModel, [name]);
      res.json(result || null);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/create-new-ce-och-motorintyg-model", async (req, res) => {
    try {
      const name = ensureText(req.body?.modellNamn).trim();
      if (!name) {
        res.json(false);
        return;
      }
      const existing = await ceQueryGet(queries.getModel, [name]);
      if (existing) {
        res.json(false);
        return;
      }
      await ceQueryRun(queries.createModel, [name]);
      res.json(true);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/save-ce-och-motorintyg-model", async (req, res) => {
    try {
      const name = ensureText(req.body?.modellNamn).trim();
      if (!name) {
        res.json(false);
        return;
      }
      const payload = buildModelPayload(req.body || {});
      const existing = await ceQueryGet(queries.getModel, [name]);
      if (!existing) {
        await ceQueryRun(queries.createModel, [name]);
      }
      await ceQueryRun(queries.updateModel, [
        payload.maskinslag_ce,
        payload.maskinslag,
        payload.fabrikat,
        payload.motorfabrikat,
        payload.motoreffekt,
        payload.motorvolym,
        payload.uppfyller_avgaskrav,
        payload.certifikat_nummer,
        payload.rek_bransle,
        payload.originalmotor,
        payload.hyudralolja,
        payload.harmoniserande_standarder,
        payload.enligt_villkoren_i_direktiv,
        payload.anmalt_organ_for_direktiv,
        payload.uppmatt_ljudeffektniva,
        payload.garanterad_ljud_och_effektniva,
        payload.namn_och_underskrift,
        payload.is_dynapac_ce,
        payload.maskin_marke,
        name
      ]);
      res.json(true);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/delete-ce-och-motorintyg-model", async (req, res) => {
    try {
      const name = ensureText(req.body?.modellNamn).trim();
      if (!name) {
        res.json(false);
        return;
      }
      await ceQueryRun(queries.deleteModel, [name]);
      res.json(true);
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/generate-placeholder-pdfs", async (req, res) => {
    try {
      const serial = ensureText(req.body?.serienummer).trim();
      if (!serial) {
        res.json(false);
        return;
      }
      const ceKey = `ce-${serial}.pdf`;
      const motorintygKey = `motorintyg-${serial}.pdf`;
      const created = [];
      if (!(await storage.exists("ce-pdfs", ceKey))) {
        await writePlaceholderPdf({ title: "CE DOCUMENT", serial, key: ceKey });
        created.push(ceKey);
      }
      if (!(await storage.exists("ce-pdfs", motorintygKey))) {
        await writePlaceholderPdf({ title: "MOTORINTYG", serial, key: motorintygKey });
        created.push(motorintygKey);
      }
      res.json({ ok: true, created, dir: storage.getLocalDir("ce-pdfs") || pdfDir });
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/generate-motorintyg-pdf", async (req, res) => {
    try {
      const serial = ensureText(req.body?.serienummer).trim();
      if (!serial) {
        res.json(false);
        return;
      }
      const outputPath = await generateMotorintygPdf(serial);
      res.json({ ok: true, path: outputPath });
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  router.post("/generate-ce-pdf", async (req, res) => {
    try {
      const serial = ensureText(req.body?.serienummer).trim();
      if (!serial) {
        res.json(false);
        return;
      }
      const outputPath = await generateCePdf(serial);
      res.json({ ok: true, path: outputPath });
    } catch (error) {
      res.status(500).json({ error: error.message || "Server error" });
    }
  });

  app.use("/api/ce", router);
  app.use("/wp-json/wccd/v1", router);
  if (storage.useSpacesStorage()) {
    app.get("/ce/pdfs/:filename", (req, res) => {
      const filename = req.params.filename;
      if (!filename || filename.includes("..")) return res.status(400).end();
      const url = storage.getPublicUrl("ce-pdfs", filename);
      if (!url || !url.startsWith("http")) return res.status(404).end();
      res.redirect(302, url);
    });
  } else {
    app.use("/ce/pdfs", express.static(pdfDir));
  }
}
