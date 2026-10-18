# LWQ Blog

用于维护 `weiqili7.github.io` 的 Hexo + Matery 源项目。

源码保存在远端 `source` 分支，生成后的静态站发布到 `main` 分支。旧站 2024-03-12 的原始发布版本另存于远端 `legacy-2024-03-12` 分支，并在本地保留于 `legacy/site/`。生成新站时会把旧文件补进 `public/`，但不会覆盖新站已经生成的同名文件。

## 快速开始

环境要求：Node.js 20 或更新版本。

```bash
npm install
npm run dev
```

然后打开终端输出的本地地址（默认是 `http://localhost:4000`）。

`npm run dev` 会直接使用最近一次生成的私密密文，不会再次索要构建密码。修改私密 Markdown 后，请先运行一次带密码的 `npm run build`，再启动或刷新本地预览。

常用检查：

```bash
npm test
npm run check
```

`npm run check` 会执行加密测试、清理旧构建并重新生成整个站点。

## 公开笔记

新建一篇默认归入“公开笔记”的文章：

```bash
npm run new:public -- "笔记标题"
```

Markdown 会出现在 `source/_posts/`。普通文章可以修改 Front Matter 中的 `categories`；“公开笔记”分类固定映射到 `/categories/public-notes/`。

## 私密笔记

新建私密笔记：

```bash
npm run new:private -- "笔记标题"
```

明文文件写入 `private-notes/`，该目录中的 Markdown 已被 `.gitignore` 排除。写作格式可参考 `private-notes.example/first-private-note.md`。

构建前设置一个至少 4 个字符的密码。为避免密码进入 shell 历史，在 zsh 中可使用：

```bash
read -s "PRIVATE_BLOG_PASSWORD?私密区密码："
echo
export PRIVATE_BLOG_PASSWORD
npm run build
unset PRIVATE_BLOG_PASSWORD
```

构建成功后可以直接运行：

```bash
npm run dev
```

此时不需要再次输入密码；这里说的是构建密码，浏览器打开 `/private/` 时仍需输入同一个密码来解锁内容。

如果 `private-notes/` 中存在笔记而没有有效密码，构建会直接失败，不会意外发布明文。

## 发布到 GitHub Pages

公开和私密内容都更新完后，在 zsh 中运行：

```bash
read -s "PRIVATE_BLOG_PASSWORD?私密区密码："
echo
export PRIVATE_BLOG_PASSWORD
npm run deploy
unset PRIVATE_BLOG_PASSWORD
```

`npm run deploy` 会先重新加密私密笔记并生成 Hexo 静态站，然后只把 `public/` 发布到远端 `main` 分支。`private-notes/` 中的 Markdown 明文不会进入发布分支；GitHub Actions 会在推送后自动更新 Pages。

如果还希望把公开 Markdown 和项目配置备份到远端源码分支，可在确认改动后运行：

```bash
git add source package.json package-lock.json README.md tools
git commit -m "Update blog content"
git push origin source
```

私密 Markdown 已被 Git 忽略，只保存在本机，请自行做好安全备份。

### 加密模型

- 整个笔记数据包（标题、日期、标签、目录来源和正文）使用 AES-256-GCM 加密。
- 密钥通过 PBKDF2-SHA-256 和随机盐派生，当前迭代次数为 310,000。
- 发布文件中的 `vault.json` 只含盐、IV 与密文，不含笔记标题或正文。
- 解锁后只把派生密钥写入当前标签页的 `sessionStorage`；刷新仍保持解锁，关闭标签页或点击“立即锁定”会清除它。
- 私密区是静态站的客户端加密，不等同于服务器访问控制。安全性取决于密码强度；虽然程序允许最短 4 个字符，但短密码很容易被拿到密文的人离线猜出，实际使用仍建议 12 个字符以上。

## 旧博客保留策略

`legacy/site/` 是旧 GitHub Pages 仓库 `main` 分支提交 `24c77de` 的只读快照，共保留 22 篇旧文章及原有资源。

Hexo 的 `after_generate` 钩子执行以下规则：

1. 先生成新的首页、公开笔记、私密区和主题资源；
2. 再遍历旧站快照；
3. 只复制新站中不存在的文件。

因此旧文章路径（例如 `/2023/.../`）继续存在，而首页、归档页、搜索索引等可逐步由新项目接管。不要直接编辑 `legacy/site/`；需要维护的内容应逐篇迁入 `source/_posts/`。

## 项目结构

```text
.
├── .github/workflows/       # GitHub Pages 静态站部署工作流
├── _config.yml              # Hexo 站点配置
├── _config.matery.yml       # Matery 主题覆盖配置
├── legacy/site/             # 旧站静态快照
├── private-notes/           # 私密 Markdown，本地保存且 Git 忽略
├── private-ui/              # 私密区解锁与阅读界面
├── scripts/                 # Hexo 生成钩子
├── source/                  # 公开内容和站点资源
├── themes/matery/           # Matery 主题源码
├── tools/                   # 私密笔记创建与加密工具
└── test/                    # 加密与泄漏测试
```

## 依赖安全说明

静态站发布后不运行 Node.js 服务；Hexo 及其插件只在本地构建阶段使用。当前 `npm audit` 仍会报告 Hexo 构建链中的传递依赖告警，主要是恶意 glob / 模板输入可触发的拒绝服务风险。官方依赖尚未提供不破坏兼容性的完整修复，`npm audit fix --force` 会错误地建议降级到 Hexo 2.x，因此不要执行该命令。

实际使用时只构建自己信任的 Markdown、配置与主题文件，并在 Hexo/Matery 发布兼容更新后再升级锁文件。

## 发布安全清单

- 检查 `public/` 中旧文章路径是否完整；
- 用测试密码在本地验证私密区的解锁、刷新保持和手动锁定；
- 确认 `public/private/vault.json` 搜索不到任何私密标题或正文；
- 确认待发布内容中不包含 `.env` 或 `private-notes/` 明文；
- 如需回滚旧站，可从远端 `legacy-2024-03-12` 分支恢复。
