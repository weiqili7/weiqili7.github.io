"use strict";

const { cp, lstat, mkdir, readdir } = require("node:fs/promises");
const { join } = require("node:path");

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function copyMissing(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyMissing(from, to);
    } else if (!(await exists(to))) {
      await cp(from, to, { preserveTimestamps: true });
    }
  }
}

hexo.extend.filter.register("after_generate", async () => {
  const legacyRoot = join(hexo.base_dir, "legacy", "site");
  if (!(await exists(legacyRoot))) {
    hexo.log.warn("未找到 legacy/site，跳过旧站快照恢复。");
    return;
  }

  await copyMissing(legacyRoot, hexo.public_dir);
  hexo.log.info("已补回旧站快照中未被新站覆盖的文件。");
});
