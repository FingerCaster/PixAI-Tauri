---
doc_type: issue-fix
issue: 2026-06-07-canvas-assistant-readable-mention-ordinal
path: fast-track
fix_date: 2026-06-07
tags: [canvas, assistant, mention, node-ref]
---

# Canvas Assistant 可读 Mention 序号定位修复记录

## 1. 问题描述

用户在 Canvas Assistant 中输入可读节点引用：

`@文本节点 #2 丰富这个节点 并生成一张图 测试`

助手返回“没有找到可丰富提示词的文本节点”。同一个意图通过 mention 菜单选择时能显示 `@文本节点 #2`，但普通文本输入 / token 丢失路径仍会失败。复测后确认还存在第二条真实路径：启用 Canvas Agent 时，模型工具调用可能把 `node_id` 传成 `文本节点 #2` 这种可见 label，而 Agent 工具层此前只接受真实节点 ID。

## 2. 根因

- `src/services/canvas-assistant.ts` 的 `parseAtMention()` 遇到 `@文本节点 #2` 时只解析出 mention 名称 `文本节点`。
- `parseNodeRef()` 同时解析出 `nodeType=text` 和 `ordinal=2`，但保留了 `name=文本节点`。
- `src/components/canvas/CanvasAssistantPanel.tsx` 的 `resolveNodeRef()` 先按节点标题精确匹配 `文本节点`。重复默认标题场景下，普通可读 mention 文本无法稳定退回到“第 2 个文本节点”的语义，最终导致 enrich / generate-from-text 找不到目标文本节点。
- `src/services/canvas-agent-tools.ts` 的 Agent 工具只按真实 `node_id` 精确查找节点。模型把工具参数传成 `@文本节点 #2 ...` 或 `文本节点 #2` 时，`propose_prompt_enrichment` / `generate_from_text_node` 仍会找不到目标文本节点。

## 3. 修复方案

- 当 mention 名称等于节点类型标签，且同时带有节点类型和序号时，`parseNodeRef()` 将其归一为 `{ nodeType, ordinal }`，让 `@文本节点 #2` 表达“第 2 个文本节点”。
- `resolveNodeRef()` 增加防御性 fallback：如果 name 精确匹配为空，但 ref 同时带有 `nodeType + ordinal`，则按类型候选列表序号定位。
- 补 parser 单测和 CanvasWorkspace 组件回归测试，覆盖“普通文本输入 `@文本节点 #2 ...`，不依赖 mention token dataset”的路径。
- Agent 工具层新增统一节点引用解析：所有接收 `node_id` / `from_node_id` / `to_node_id` 的工具都支持真实 ID、当前摘要里的可见 label，以及带 `@` 和后续动作文本的可读引用。
- 补 Agent tool 回归测试：`propose_prompt_enrichment` 收到 `@文本节点 #2 丰富这个节点 并生成一张图 测试`，`generate_from_text_node` 收到 `文本节点 #2` 时，都必须命中第二个文本节点。

## 4. 改动文件清单

- `src/services/canvas-assistant.ts`
- `src/services/canvas-assistant.test.ts`
- `src/services/canvas-agent-tools.ts`
- `src/services/canvas-agent-tools.test.ts`
- `src/components/canvas/CanvasAssistantPanel.tsx`
- `src/components/canvas/CanvasWorkspace.test.tsx`

## 5. 验证结果

- `pnpm exec vitest run src\services\canvas-assistant.test.ts src\components\canvas\CanvasWorkspace.test.tsx`：通过，2 files / 42 tests。
- `pnpm exec vitest run src\services\canvas-agent-tools.test.ts src\services\canvas-agent-runner.test.ts src\services\canvas-assistant.test.ts src\components\canvas\CanvasWorkspace.test.tsx`：通过，4 files / 50 tests。
- 真实 `PixAI Dev` WebView2 smoke：通过。通过 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9229` 连接真实 Tauri WebView 页面，构造两个同名文本节点并输入 `@文本节点 #2 丰富这个节点 并生成一张图 测试`；验证结果为：
  - `promptInputs[0].prompt = 第二段提示词`
  - `generatedNodeIds = [canvas-node_01381c15-e942-4f6c-b246-c56ecd6bac7f]`
  - 生成节点和 prompt connection 从 `smoke-text-2` 创建
  - 页面没有“没有找到可丰富提示词的文本节点”
  - 页面没有“创建生成节点失败”
  - pending change 显示“原文：第二段提示词 / 候选：丰富后的第二段提示词”
- `pnpm check`：通过，39 files / 293 tests。
- 已重新启动干净的真实 Tauri dev 测试窗口：`pnpm dev:client`，新 `target\debug\pixai-tauri.exe` PID 为 `87624`，WebView 使用 `com.fingercaster.pixai.tauri.dev` 数据目录，9229 调试端口已关闭。

## 6. 遗留事项

无。
