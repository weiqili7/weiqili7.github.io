---
title: 博客恢复工作台
date: 2026-10-18 22:00:00
updated: 2026-10-18 22:00:00
categories:
  - 公开笔记
tags:
  - Hexo
  - Matery
top: true
cover: true
toc: true
---

这个站点正在从旧的静态发布版本恢复为可维护的 Hexo 源项目。

## 现在包含什么

- 基于 Matery 的公开博客与公开笔记分类；
- 原站静态文件的只读快照，构建时会补回尚未迁移的旧链接；
- 独立的私密笔记区，标题、目录和正文都在构建时加密；
- 本地构建流程，不含任何自动部署配置。

## 写作方式

公开笔记保存在 `source/_posts/`，可以使用标准 Hexo Markdown 与 Front Matter。

私密笔记保存在本地的 `private-notes/`。这个目录里的 Markdown 已被 Git 忽略，只有密文会进入最终静态站点。

## 迁移原则

旧内容先保持原样可访问，再按需要逐篇迁回 Markdown。新内容不会主动覆盖线上旧站。
