/**
 * Storage abstraction: local filesystem or DigitalOcean Spaces (S3-compatible).
 * Uses Spaces when SPACES_KEY, SPACES_SECRET, SPACES_BUCKET, SPACES_ENDPOINT are set.
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const useSpaces =
  process.env.SPACES_KEY &&
  process.env.SPACES_SECRET &&
  process.env.SPACES_BUCKET &&
  process.env.SPACES_ENDPOINT;

const PREFIXES = {
  "category-images": "storage/spare-part-images",
  "catalog-images": "storage/product-catalog-images",
  json: "output/json",
  output: "output",
  "ce-pdfs": "ce/pdfs"
};

let s3Client = null;

async function getS3() {
  if (!s3Client && useSpaces) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({
      endpoint: process.env.SPACES_ENDPOINT,
      region: process.env.SPACES_REGION || "fra1",
      credentials: {
        accessKeyId: process.env.SPACES_KEY,
        secretAccessKey: process.env.SPACES_SECRET
      },
      forcePathStyle: false
    });
  }
  return s3Client;
}

function getLocalPath(store, key) {
  const base = {
    "category-images":
      process.env.MANAGER_CATEGORY_IMAGES_DIR || resolve(rootDir, "data", "images", "spare-part-images"),
    "catalog-images":
      process.env.MANAGER_CATALOG_IMAGES_DIR || resolve(rootDir, "data", "images", "product-catalog-images"),
    json: process.env.MANAGER_JSON_DIR || resolve(rootDir, "output", "json"),
    output: process.env.MANAGER_OUTPUT_DIR || resolve(rootDir, "output"),
    "ce-pdfs": process.env.CE_PDF_DIR || resolve(rootDir, "ce", "pdfs")
  }[store];
  return resolve(base, key);
}

function getSpacesKey(store, key) {
  const prefix = PREFIXES[store];
  return prefix ? `${prefix}/${key}`.replace(/\/+/g, "/") : key;
}

function ensureLocalDir(path) {
  mkdirSync(path, { recursive: true });
}

export function useSpacesStorage() {
  return Boolean(useSpaces);
}

export function getPublicUrl(store, key) {
  if (!key) return "";
  if (useSpaces && process.env.SPACES_CDN_URL) {
    const fullKey = getSpacesKey(store, key);
    const base = process.env.SPACES_CDN_URL.replace(/\/$/, "");
    return `${base}/${fullKey}`;
  }
  const pathMap = {
    "category-images": "/images/spare-part-images",
    "catalog-images": "/images/product-catalog-images",
    json: "/json",
    output: "/files",
    "ce-pdfs": "/ce/pdfs"
  };
  const base = pathMap[store] || "";
  return `${base}/${key}`.replace(/\/+/g, "/");
}

export async function put(store, key, buffer) {
  if (useSpaces) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await getS3();
    const fullKey = getSpacesKey(store, key);
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: fullKey,
        Body: buffer,
        ACL: "public-read"
      })
    );
    return;
  }
  const path = getLocalPath(store, key);
  ensureLocalDir(resolve(path, ".."));
  writeFileSync(path, buffer);
}

export async function get(store, key) {
  if (useSpaces) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await getS3();
    const fullKey = getSpacesKey(store, key);
    try {
      const res = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: fullKey
        })
      );
      const chunks = [];
      for await (const chunk of res.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      if (err.name === "NoSuchKey") return null;
      throw err;
    }
  }
  const path = getLocalPath(store, key);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

export async function getString(store, key) {
  const buf = await get(store, key);
  return buf ? buf.toString("utf8") : null;
}

export async function exists(store, key) {
  if (useSpaces) {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await getS3();
    const fullKey = getSpacesKey(store, key);
    return s3
      .send(
        new HeadObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: fullKey
        })
      )
      .then(() => true)
      .catch((err) => {
        if (err.name === "NotFound") return false;
        throw err;
      });
  }
  return existsSync(getLocalPath(store, key));
}


export async function list(store, prefix = "") {
  if (useSpaces) {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const s3 = await getS3();
    const basePrefix = getSpacesKey(store, prefix);
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.SPACES_BUCKET,
        Prefix: basePrefix
      })
    );
    const baseLen = basePrefix.length + (basePrefix.endsWith("/") ? 0 : 1);
    return (result.Contents || []).map((o) => o.Key?.slice(baseLen) || "").filter(Boolean);
  }
  const dir = getLocalPath(store, prefix);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

export async function remove(store, key) {
  if (useSpaces) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await getS3();
    const fullKey = getSpacesKey(store, key);
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: fullKey
      })
    );
    return;
  }
  const path = getLocalPath(store, key);
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

export function getLocalDir(store) {
  if (useSpaces) return null;
  const base = {
    "category-images":
      process.env.MANAGER_CATEGORY_IMAGES_DIR || resolve(rootDir, "data", "images", "spare-part-images"),
    "catalog-images":
      process.env.MANAGER_CATALOG_IMAGES_DIR || resolve(rootDir, "data", "images", "product-catalog-images"),
    json: process.env.MANAGER_JSON_DIR || resolve(rootDir, "output", "json"),
    output: process.env.MANAGER_OUTPUT_DIR || resolve(rootDir, "output"),
    "ce-pdfs": process.env.CE_PDF_DIR || resolve(rootDir, "ce", "pdfs")
  }[store];
  return base;
}
