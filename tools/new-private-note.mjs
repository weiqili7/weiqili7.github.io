import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [rawTitle = "", ...rawTags] = process.argv.slice(2);
const title = rawTitle.trim();
const tags = [
  ...new Set(rawTags.flatMap((value) => value.split(",")).map((tag) => tag.trim()).filter(Boolean)),
];

if (!title || tags.length === 0) {
  console.error('用法：npm run new:private -- "笔记标题" "标签1,标签2"');
  process.exit(1);
}

const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, "-");
const safeTitle = title
  .normalize("NFKC")
  .replace(/[\\/:*?"<>|]/g, "-")
  .replace(/\s+/g, "-")
  .slice(0, 80);
const directory = join(projectRoot, "private-notes");
const destination = join(directory, `${timestamp}-${safeTitle}.md`);
const localDate = now.toISOString();

await mkdir(directory, { recursive: true });
await writeFile(
  destination,
  `---\ntitle: ${JSON.stringify(title)}\ndate: ${localDate}\ntags:\n${tags.map((tag) => `  - ${JSON.stringify(tag)}`).join("\n")}\n---\n\n从这里开始写私密笔记。\n`,
  { encoding: "utf8", flag: "wx" },
);

console.log(`已创建 ${destination}`);
