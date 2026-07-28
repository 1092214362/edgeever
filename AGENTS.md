# AGENTS.md

本文件用于约束和指导参与本项目的 AI 代理与协作者。

## 文档与分支约束

- **技术栈与背景**：优先参考 `README.md`。
- **双语同步**：修改中文文档时必须同步更新对应的英文文档。
- **分支规范**：严禁创建新分支，所有修改与提交必须直接在 `main` 分支上完成。

## GitHub Release 约束与流程

1. **版本号与基线**：使用 `vX.Y.Z` 格式（非 Draft/Prerelease）。递增根目录 `package.json`；若含移动端修改，同步更新 `apps/mobile/app.json` 的 `expo.version` 并递增 `android.versionCode`。上一个实际 Release 为审计基线。
2. **跨平台 Release 资产**：每个正式 Release 页面必须同时包含 macOS arm64 DMG 和 Android arm64 APK。若本次未修改对应原生运行时代码、依赖、配置或构建工具，直接复用上一个正式 Release 中已验证的原始资产，保留原文件名与校验和，禁止仅为匹配新版本号而重命名。
3. **验证命令**：必须通过 `bun run typecheck`、`bun run typecheck:mobile` 和 `bun run build:web`。
4. **原生资产构建与复用**：仅当变更影响移动端运行时代码、共享依赖、原生配置或 Android 构建工具时，执行 `bun run build:android:apk:local` 构建生产签名 APK（签名配置必须位于仓库外 `~/.config/edgeever/android/signing.env`）；仅当变更影响 Electron、Rust sidecar、原生依赖、打包配置或桌面构建工具时重新构建 macOS DMG。无对应原生变更时，由 Release 工作流复用最近兼容资产。
5. **禁止公开未验收资产**：Release 准备期间必须保持 Draft；只有最终资产完成本节全部验收后才能公开为正式 Release。禁止把关闭签名或公证生成的本地 DMG 上传到公开 Release；此类产物只能用于开发排障。若 CI 只能通过 `published` 事件触发，应在触发后立即转回 Draft，并在最终公开前确认没有重复工作流仍可能覆盖已验收资产。
6. **macOS 最终资产验收**：验收对象必须是从 GitHub Release 页面重新下载的最终 DMG，禁止用本地构建目录中的产物代替。必须核对 Release digest/本地 SHA-256，并依次通过 `hdiutil verify`、挂载、`codesign --verify --deep --strict`、`spctl --assess --type execute`（结果必须为 `accepted` 且来源为 `Notarized Developer ID`）和 `xcrun stapler validate`。随后必须写入模拟浏览器下载的 `com.apple.quarantine` 属性，将 App 复制到临时目录并实际启动；任何一步失败都禁止发布，也禁止指导用户绕过 Gatekeeper。
7. **桌面端真实首启冒烟测试**：凡涉及 Electron、preload、认证、实例地址、首次引导或本地配置，必须对最终打包 App 使用全新的临时 `--user-data-dir` 实际启动，不能复用开发者机器上的历史配置。测试至少覆盖 preload 桥接可用、未配置实例时实例地址为空、首次打开显示实例地址输入界面，以及保存后能进入预期流程。类型检查、Web 构建、ASAR 文件存在性检查和已有用户配置下的启动均不能替代该测试。
8. **桌面包结构门禁**：桌面变更除通用验证命令外，必须运行桌面测试及 `EDGE_EVER_VERIFY_TARGET=darwin bun run verify:desktop-package`。验证脚本必须实际加载打包后的 preload 入口并确认桥接 API 可注册；仅检查文件存在或扩展名不视为通过。
9. **资产不可变与工作流收尾**：最终验收后，必须确认没有重复或仍在运行的 Release 工作流会再次上传并覆盖资产。正式 Release 只保留本次计划中的一套 macOS DMG/Blockmap/更新清单和一个符合复用规则的 Android APK；发现意外、重复或被重新上传的资产时，必须先恢复 Draft、清理并重新下载验收，不能假设校验仍然有效。
10. **失败处理**：任一签名、公证、Gatekeeper、隔离启动或真实首启检查失败时，必须保持或恢复 Draft，修复后重新构建并完整重跑最终资产验收。不得让已知损坏或未经验收的 Release 保持公开。
11. **Release 说明结构**：使用中英文双语格式（正文禁止包含字面量 `\n`）。功能/修复关联对应 Issue 并标记 Label，发布后回链并关闭 Issue。正文结构：

```md
## Key Changes

- User-facing summary of changes in English.

Related Issue: #<issue-number>

## Verification

- List completed tests, type checks, and build results in English.

## 🇨🇳 中文说明 / Chinese Changelog

## 主要更新

- 面向用户说明本次变化及影响。

关联 Issue：#<issue-number>

## 验证

- 列出实际完成的测试、类型检查和构建结果。
```

## 环境、部署与组件约束

- **Cloudflare 部署**：严格按 `docs/agent-deploy-cloudflare.md` 执行。
- **数据库 Migration**：数据库或种子变化时，在 `migrations/` 下新增递增编号 SQL，禁止修改已执行的旧 Migration。
- **本地启动**：默认 `bun run dev`（纯本地环境）；指定远程实例用 `EDGE_EVER_INSTANCE=<实例名> bun run dev:remote`；纯前端用 `bun run dev:web`。
- **Demo 示例同步**：修改示例笔记后，在 `main` 分支干净状态下执行 `bun run demo:sync` 重置公开 Demo。
- **组件复用**：优先复用 `shadcn/ui` 与已成熟依赖，禁止无意义造轮子；复杂或重复模块封装为独立组件。
