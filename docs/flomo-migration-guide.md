# flomo 笔记迁移指引

[简体中文](flomo-migration-guide.md) | [English](flomo-migration-guide.en-US.md)

迁移不需要 flomo Max 或 flomo MCP。使用 flomo 面向所有用户提供的 HTML 全量导出，再由已经配置好的 **EdgeEver MCP** 幂等导入即可。整个迁移只需把导出文件交给支持本地文件与 MCP 的 AI Agent，然后发送一条 Prompt。

### 步骤 1：导出 flomo

在 flomo 网页版或桌面客户端中，点击左上角用户名及会员标识右侧的小下拉箭头，在账户菜单中进入 **设置 → 账号详情**，然后滚动账号详情内容区到页面最下方，点击全局导出并下载 HTML 导出 ZIP。请勿修改或重新打包 ZIP 内的目录结构。

### 步骤 2：配置 EdgeEver MCP

在 EdgeEver 的 **设置 → API & MCP 授权** 中生成具有笔记、笔记本和资源读写权限的 Token，点击 **复制完整 MCP 配置**，并将其配置到 Codex、Claude Code、Cursor 等 AI Agent 中。

### 步骤 3：发送一条 Prompt 完成导入

把下面的 `/path/to/flomo-export.zip` 替换成真实路径，然后将整段 Prompt 发送给已经连接 EdgeEver MCP 的 Agent：

```text
请通过已配置的 EdgeEver MCP，将 `/path/to/flomo-export.zip` 中的全部笔记迁移到 `flomo` 笔记本，完整保留正文、标签、创建时间、图片和附件。迁移完成后校验完整性并报告结果。
```

确认迁移完整前，请保留原始 flomo ZIP。
