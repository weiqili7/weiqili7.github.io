import { createHash, pbkdf2 as pbkdf2Callback, randomBytes, createCipheriv } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as yaml from "js-yaml";

const pbkdf2 = promisify(pbkdf2Callback);
const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDir, "..");
const AAD = Buffer.from("lwq-private-notes:v1", "utf8");
const DEFAULT_ITERATIONS = 310_000;

async function listMarkdownFiles(root) {
  const files = [];
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(absolute)));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }

  return files.sort();
}

function normalizeTags(tags) {
  if (!tags) return [];
  return Array.isArray(tags) ? tags.map(String) : [String(tags)];
}

function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseMarkdown(raw, file) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, content: raw };

  const data = yaml.load(match[1]) || {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`私密笔记 Front Matter 必须是对象：${file}`);
  }

  return { data, content: raw.slice(match[0].length) };
}

export async function readPrivateNotes(notesDir) {
  const files = await listMarkdownFiles(notesDir);
  const notes = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const parsed = parseMarkdown(raw, file);
    const relativePath = relative(notesDir, file).replaceAll("\\", "/");
    const title = parsed.data.title ? String(parsed.data.title) : relativePath.replace(/\.md$/, "");

    notes.push({
      id: createHash("sha256").update(relativePath).digest("hex").slice(0, 16),
      title,
      date: normalizeDate(parsed.data.date),
      updated: normalizeDate(parsed.data.updated),
      tags: normalizeTags(parsed.data.tags),
      markdown: parsed.content.trim(),
    });
  }

  return notes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function encryptPayload(payload, password, iterations) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);

  return pbkdf2(password, salt, iterations, 32, "sha256").then((key) => {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      version: 1,
      algorithm: "AES-256-GCM",
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations,
        salt: salt.toString("base64"),
      },
      cipher: {
        iv: iv.toString("base64"),
        data: Buffer.concat([ciphertext, tag]).toString("base64"),
      },
    };
  });
}

async function copyBrowserDependencies(outputDir) {
  const require = createRequire(import.meta.url);
  const markedEntry = require.resolve("marked");
  const dompurifyEntry = require.resolve("dompurify");
  const vendorDir = join(outputDir, "vendor");
  await mkdir(vendorDir, { recursive: true });
  await copyFile(join(dirname(markedEntry), "marked.esm.js"), join(vendorDir, "marked.esm.js"));
  await copyFile(join(dirname(dompurifyEntry), "purify.es.mjs"), join(vendorDir, "purify.es.mjs"));
}

export async function buildVault({
  notesDir = join(projectRoot, "private-notes"),
  outputDir = join(projectRoot, "source", "private"),
  password = process.env.PRIVATE_BLOG_PASSWORD,
  iterations = DEFAULT_ITERATIONS,
} = {}) {
  const notes = await readPrivateNotes(notesDir);

  if (notes.length > 0 && (!password || password.length < 4)) {
    throw new Error(
      "发现私密笔记，但 PRIVATE_BLOG_PASSWORD 未设置或少于 4 个字符。请先设置构建密码。",
    );
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const vault = notes.length
    ? await encryptPayload({ version: 1, notes }, password, iterations)
    : { version: 1, empty: true, noteCount: 0 };

  await Promise.all([
    copyFile(join(projectRoot, "private-ui", "index.html"), join(outputDir, "index.html")),
    copyFile(join(projectRoot, "private-ui", "app.js"), join(outputDir, "app.js")),
    copyFile(join(projectRoot, "private-ui", "private.css"), join(outputDir, "private.css")),
    writeFile(join(outputDir, "vault.json"), `${JSON.stringify(vault)}\n`, "utf8"),
    copyBrowserDependencies(outputDir),
  ]);

  return { noteCount: notes.length, outputDir };
}

async function main() {
  const result = await buildVault();
  console.log(`私密区已生成：${result.noteCount} 篇笔记 -> ${relative(projectRoot, result.outputDir)}`);
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
