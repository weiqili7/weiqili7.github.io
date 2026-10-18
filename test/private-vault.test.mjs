import assert from "node:assert/strict";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildVault } from "../tools/build-private-vault.mjs";

const AAD = Buffer.from("lwq-private-notes:v1", "utf8");

test("私密仓库不会泄露标题、目录或正文，并可用正确密码还原", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lwq-private-vault-"));
  const notesDir = join(temporaryRoot, "notes");
  const outputDir = join(temporaryRoot, "output");
  const password = "correct horse battery staple";

  try {
    await mkdir(notesDir);
    await writeFile(
      join(notesDir, "secret.md"),
      "---\ntitle: 隐藏标题\ndate: 2026-10-18\ntags: [机密]\n---\n\n## 隐藏目录\n\n隐藏正文。\n",
      "utf8",
    );

    const result = await buildVault({ notesDir, outputDir, password, iterations: 1_000 });
    assert.equal(result.noteCount, 1);
    await Promise.all([
      readFile(join(outputDir, "vendor", "katex", "katex.mjs")),
      readFile(join(outputDir, "vendor", "katex", "katex.min.css")),
      readFile(join(outputDir, "vendor", "katex", "contrib", "auto-render.mjs")),
      readFile(join(outputDir, "vendor", "katex", "fonts", "KaTeX_Main-Regular.woff2")),
    ]);

    const serializedVault = await readFile(join(outputDir, "vault.json"), "utf8");
    assert.equal(serializedVault.includes("隐藏标题"), false);
    assert.equal(serializedVault.includes("隐藏目录"), false);
    assert.equal(serializedVault.includes("隐藏正文"), false);

    const vault = JSON.parse(serializedVault);
    const salt = Buffer.from(vault.kdf.salt, "base64");
    const iv = Buffer.from(vault.cipher.iv, "base64");
    const encrypted = Buffer.from(vault.cipher.data, "base64");
    const ciphertext = encrypted.subarray(0, -16);
    const tag = encrypted.subarray(-16);
    const key = pbkdf2Sync(password, salt, vault.kdf.iterations, 32, "sha256");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const payload = JSON.parse(plaintext);

    assert.equal(payload.notes[0].title, "隐藏标题");
    assert.match(payload.notes[0].markdown, /隐藏目录/);
    assert.match(payload.notes[0].markdown, /隐藏正文/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("存在私密笔记时拒绝空密码或弱密码", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lwq-private-vault-"));
  const notesDir = join(temporaryRoot, "notes");
  const outputDir = join(temporaryRoot, "output");

  try {
    await mkdir(notesDir);
    await writeFile(join(notesDir, "secret.md"), "---\ntitle: Secret\n---\nbody\n", "utf8");
    await assert.rejects(
      buildVault({ notesDir, outputDir, password: "123" }),
      /PRIVATE_BLOG_PASSWORD/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
