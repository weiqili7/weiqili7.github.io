import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(projectRoot, "public");

function captureGit(args, cwd = projectRoot) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} 执行失败（退出码 ${result.status}）。`);
  }
}

async function replaceSiteContents(checkoutDir) {
  for (const entry of await readdir(checkoutDir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".github") continue;
    await rm(join(checkoutDir, entry.name), { recursive: true, force: true });
  }

  for (const entry of await readdir(publicDir, { withFileTypes: true })) {
    await cp(join(publicDir, entry.name), join(checkoutDir, entry.name), {
      recursive: entry.isDirectory(),
    });
  }
}

async function main() {
  const remote = captureGit(["remote", "get-url", "origin"]);
  const tempRoot = await mkdtemp(join(tmpdir(), "lwq-blog-publish-"));
  const checkoutDir = join(tempRoot, "site");

  try {
    runGit(["clone", "--depth", "1", "--branch", "main", "--single-branch", remote, checkoutDir], projectRoot);
    await replaceSiteContents(checkoutDir);
    runGit(["add", "-A"], checkoutDir);

    const stagedFiles = captureGit(["diff", "--cached", "--name-only"], checkoutDir)
      .split("\n")
      .filter(Boolean);
    const unsafeFile = stagedFiles.find(
      (file) => file.startsWith("private-notes/") || basename(file) === ".env",
    );
    if (unsafeFile) throw new Error(`拒绝发布可能包含私密明文的文件：${unsafeFile}`);

    const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: checkoutDir });
    if (diff.status === 0) {
      console.log("线上内容已经是最新版本，无需重复发布。");
      return;
    }
    if (diff.status !== 1) throw new Error("无法检查待发布文件。请确认 Git 仓库状态正常。");

    const timestamp = new Date().toISOString().replace("T", " ").replace(/:\d{2}\.\d{3}Z$/, " UTC");
    runGit(["commit", "-m", `Site updated: ${timestamp}`], checkoutDir);
    runGit(["push", "origin", "main"], checkoutDir);
    console.log("发布已推送。GitHub Pages 通常会在一分钟内更新：https://weiqili7.github.io/");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
