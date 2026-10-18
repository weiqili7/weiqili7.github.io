import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";
import renderMathInElement from "./vendor/katex/contrib/auto-render.mjs";

const STORAGE_KEY = "lwq-private-vault-key-v1";
const AAD = new TextEncoder().encode("lwq-private-notes:v1");

const elements = {
  unlockPanel: document.querySelector("#unlock-panel"),
  emptyPanel: document.querySelector("#empty-panel"),
  form: document.querySelector("#unlock-form"),
  password: document.querySelector("#password"),
  status: document.querySelector("#unlock-status"),
  lock: document.querySelector("#lock-button"),
  vault: document.querySelector("#vault"),
  count: document.querySelector("#note-count"),
  list: document.querySelector("#note-list"),
  search: document.querySelector("#note-search"),
  reader: document.querySelector("#reader"),
  title: document.querySelector("#note-title"),
  meta: document.querySelector("#note-meta"),
  toc: document.querySelector("#note-toc"),
  body: document.querySelector("#note-body"),
};

let encryptedVault;
let notes = [];

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toBase64(value) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function deriveKey(password) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: encryptedVault.kdf.hash,
      salt: fromBase64(encryptedVault.kdf.salt),
      iterations: encryptedVault.kdf.iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );
}

async function importStoredKey(encoded) {
  return crypto.subtle.importKey(
    "raw",
    fromBase64(encoded),
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );
}

async function decryptWithKey(key) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(encryptedVault.cipher.iv),
      additionalData: AAD,
      tagLength: 128,
    },
    key,
    fromBase64(encryptedVault.cipher.data),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function slugifyHeading(text, index) {
  const slug = text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return slug || `section-${index + 1}`;
}

function buildToc() {
  elements.toc.replaceChildren();
  const headings = [...elements.body.querySelectorAll("h2, h3")];
  if (!headings.length) {
    elements.toc.hidden = true;
    return;
  }

  const title = document.createElement("strong");
  title.textContent = "目录";
  const list = document.createElement("ol");

  headings.forEach((heading, index) => {
    const id = slugifyHeading(heading.textContent, index);
    heading.id = id;
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${id}`;
    link.textContent = heading.textContent;
    if (heading.tagName === "H3") item.classList.add("toc-subitem");
    item.append(link);
    list.append(item);
  });

  elements.toc.append(title, list);
  elements.toc.hidden = false;
}

function formatDate(value) {
  if (!value) return "未标日期";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(parsed);
}

function selectNote(note) {
  if (!note) return;
  elements.title.textContent = note.title;
  const tagText = note.tags.length ? ` · ${note.tags.join(" / ")}` : "";
  elements.meta.textContent = `${formatDate(note.date)}${tagText}`;
  const html = marked.parse(note.markdown, { gfm: true, breaks: false });
  elements.body.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  renderMathInElement(elements.body, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "\\(", right: "\\)", display: false },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
    trust: false,
  });
  buildToc();
  document.querySelectorAll(".note-button").forEach((button) => {
    button.setAttribute("aria-current", button.dataset.id === note.id ? "page" : "false");
  });
  history.replaceState(null, "", `#note-${note.id}`);
  elements.reader.focus({ preventScroll: true });
}

function renderList(query = "") {
  elements.list.replaceChildren();
  const needle = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = notes.filter((note) => {
    const haystack = `${note.title} ${note.tags.join(" ")}`.toLocaleLowerCase("zh-CN");
    return haystack.includes(needle);
  });

  for (const note of filtered) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-button";
    button.dataset.id = note.id;

    const title = document.createElement("span");
    title.className = "note-button-title";
    title.textContent = note.title;
    const date = document.createElement("span");
    date.className = "note-button-date";
    date.textContent = formatDate(note.date);
    button.append(title, date);
    button.addEventListener("click", () => selectNote(note));
    item.append(button);
    elements.list.append(item);
  }

  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "没有匹配的笔记";
    elements.list.append(empty);
  }
}

function showUnlocked(payload) {
  notes = payload.notes || [];
  elements.unlockPanel.hidden = true;
  elements.vault.hidden = false;
  elements.lock.hidden = false;
  elements.count.textContent = `${notes.length} 篇`;
  renderList();
  const hashId = location.hash.startsWith("#note-") ? location.hash.slice(6) : "";
  selectNote(notes.find((note) => note.id === hashId) || notes[0]);
}

function lockVault() {
  sessionStorage.removeItem(STORAGE_KEY);
  notes = [];
  elements.body.replaceChildren();
  elements.list.replaceChildren();
  elements.toc.replaceChildren();
  elements.title.textContent = "";
  elements.meta.textContent = "";
  elements.password.value = "";
  elements.status.textContent = "已锁定。";
  elements.vault.hidden = true;
  elements.lock.hidden = true;
  elements.unlockPanel.hidden = false;
  history.replaceState(null, "", location.pathname);
  elements.password.focus();
}

async function unlockWithKey(key, remember) {
  const payload = await decryptWithKey(key);
  if (remember) {
    const rawKey = await crypto.subtle.exportKey("raw", key);
    sessionStorage.setItem(STORAGE_KEY, toBase64(rawKey));
  }
  showUnlocked(payload);
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.status.textContent = "正在验证并解密…";
  const submit = elements.form.querySelector('button[type="submit"]');
  submit.disabled = true;

  try {
    const key = await deriveKey(elements.password.value);
    await unlockWithKey(key, true);
    elements.password.value = "";
    elements.status.textContent = "";
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    elements.status.textContent = "密码不正确，或加密数据已损坏。";
    elements.password.select();
  } finally {
    submit.disabled = false;
  }
});

elements.lock.addEventListener("click", lockVault);
elements.search.addEventListener("input", () => renderList(elements.search.value));

async function initialize() {
  try {
    const response = await fetch("./vault.json", { cache: "no-store" });
    if (!response.ok) throw new Error("vault unavailable");
    encryptedVault = await response.json();

    if (encryptedVault.empty) {
      elements.unlockPanel.hidden = true;
      elements.emptyPanel.hidden = false;
      return;
    }

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        await unlockWithKey(await importStoredKey(stored), false);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    elements.status.textContent = "无法读取加密数据，请确认站点已完整构建。";
    elements.form.querySelector('button[type="submit"]').disabled = true;
  }
}

initialize();
