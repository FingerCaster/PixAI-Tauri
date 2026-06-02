---
doc_type: requirement
slug: macos-desktop-distribution
pitch: 让 PixAI 能构建、分发并更新 macOS 桌面版本。
status: draft
last_reviewed: 2026-06-03
implemented_by: []
tags: [macos, tauri, distribution, updater]
---

# macOS 桌面分发

## 用户故事

- 作为使用 Mac 的创作者，我希望能直接安装 PixAI，而不是只能看 Windows 版本。
- 作为维护发布的人，我希望同一套 GitHub Release 能同时承载 Windows 和 macOS 资产，而不是拆成两套平行流程。
- 作为已经安装 macOS 版本的用户，我希望应用内“检查更新”能识别自己的平台并拿到正确的更新包。

## 为什么需要

当前仓库已经具备 Tauri 桌面基础和 Windows 正式 updater 发布链，但构建、发布文档和应用内更新逻辑都偏向 Windows。没有 macOS 路径时，用户只能停留在“理论可支持”，不能真正拿到可安装包，也无法验证跨平台 updater 是否成立。

## 怎么解决

把能力拆成两层推进：

1. 在 macOS 原生环境完成 `.app` / `.dmg` / updater 资产的构建闭环。
2. 让应用内更新和发布脚本从“只认识 Windows”升级到“按平台识别并发布正确资产”，同一个 `latest.json` 可同时覆盖 Windows 与 macOS。

## 边界

- 不做 Linux 发版支持。
- 不做 Mac App Store 渠道。
- 不负责申请 Apple Developer 账号或团队权限本身。
- 不改动图片生成、工作台、参考图等业务功能。

## 当前实现

- `src-tauri/tauri.conf.json` 已包含 `icon.icns`，说明仓库已有 macOS bundle 基础资源。
- Windows 已有正式和本地 updater 发布脚本，但它们当前只处理 MSI / NSIS。
- 应用内更新当前按 Windows 安装器类型选择 target，非 Windows 会落入 `unknown` 路径。

## 变更记录

- 2026-06-03：新增需求草案，准备把 PixAI 从 Windows-only 发布链扩展到 macOS 构建与分发能力。
