---
doc_type: issue-fix
issue: 2026-06-05-canvas-node-interaction-regressions
path: fast-track
fix_date: 2026-06-06
related: [canvas-node-interaction-regressions-report.md, canvas-node-interaction-regressions-analysis.md]
tags: [canvas, node, frontend, interaction, image-node]
---

# Canvas 节点交互回归修复记录

## 1. 问题描述

用户复核后确认 Canvas 上仍存在图片节点体验问题：历史图节点标题过长挤压头部操作区，图片节点默认尺寸偏小导致图片显示区域不够，连线 / 删除 / 预览 / mask 等操作入口不够明显；同时文本节点仍有未提交草稿被上游刷新覆盖的风险。后续复核进一步确认：标题不应被改写成“历史图”，应保留原始文件名 / 历史名，但节点头部需要显示短标题；节点内图片也不能裁切或只显示一截。再次复核确认：Canvas 图片节点点开大图后，Esc 可以关闭，但右上角关闭按钮点击无效。随后发现 Canvas 节点允许双向或多节点成环连接。

## 2. 根因

- `CanvasNodeLayer` 只在选中节点时显示删除按钮，长标题占满头部后会让连接和删除入口难以发现。
- `CanvasNodeLayer` 在 `nodes` props 变化时整体重置 `draftNodes`，未提交文本 / 生成 / 批量节点草稿可能被旧持久化内容覆盖。
- 图片节点默认尺寸为 `240x180`，扣掉头部后实际图片展示区域过小。
- 图片节点主体用 `place-items-center` + `object-contain` 渲染缩略图，遇到宽图或高度计算不稳定时会被压成一条横向窄图。
- 历史图节点直接沿用 `history_*` 或 UUID 风格文件名，节点标题信息密度过高；但标题本身仍是用户识别图片的依据，不能被替换成泛化文案。
- 旧项目中已经持久化的图片 / 结果节点仍保留旧尺寸，例如 `240x180` / `260x180`，只修改新建节点默认值不会影响这些存量节点的显示。
- 图片预览和 mask 入口此前依赖 hover 显示，不适合承担核心操作入口。
- 本地图片通过文件选择器加入 Canvas 时直接把完整 data URL 写入节点 `metadata.content`；Canvas 项目服务会把节点内容限制到 500,000 字符，大图持久化后 data URL 被截断，浏览器仍可能解码出图片顶部一截。工作台 / 历史图加入 Canvas 会携带 `storagePath`，显示时走本地文件路径，因此不会触发该截断问题。
- 图片预览弹窗依赖通用 `DialogContent` 默认关闭按钮；在 Canvas 预览场景中，Esc 关闭链路正常，但默认关闭按钮的鼠标点击链路不稳定，导致用户点右上角 X 无法关闭弹窗。
- `CanvasStore.addConnection` 只过滤自连接和完全重复连接，未判断新增边是否会让当前连接图成环；`normalizeCanvasConnections` 也未清理已持久化或导入项目中的成环连接。

## 3. 修复方案

- 节点头部改为常驻显示连接和删除按钮，长标题只占剩余空间并保留 `title` tooltip。
- 文本 / 生成 / 批量节点草稿改为 dirty merge：上游节点刷新时保留正在编辑的本地 `metadata.content`，提交后再清除 dirty 标记。
- 连线锚点从源节点右侧连接到目标节点左侧，减少曲线穿过目标节点主体的情况。
- 图片 / 结果节点默认尺寸统一提升到 `320x260`，自动布局横纵间距同步扩大。
- 旧项目已持久化的图片 / 结果节点在渲染层按最低 `320x260` 显示，不写回存储数据，连线锚点也按显示尺寸计算。
- 图片节点标题保留原始名称，不再替换成“历史图”；节点头部和结果节点信息行显示中间省略短标题，`title` tooltip 保留完整名称。
- 图片节点主体改为固定预览框，节点内使用 `object-contain` 显示完整图片；旧节点加载图片后记录本地自然宽高，并在渲染层按图片比例扩展显示宽高，避免宽图变横条或竖图被裁切。
- 图片预览和 mask 入口改为常驻可见按钮。
- 本地图片加入 Canvas 时复用 references 文件存储：先调用 `storeDataUrlFile('references', ...)` 落盘，节点内容和 `storagePath` 保存短路径，不再持久化大体积 data URL，从根源避开 Canvas 内容长度截断。
- 本地导入时从 PNG / JPEG / WEBP 文件头读取自然宽高并写入节点 metadata，保证初次渲染就能按原图比例计算节点显示尺寸。
- Canvas 生成前处理未绑定参考图的 storage-backed 图片节点：如果节点只有 `storagePath`，先用 `readLocalImageDataUrl` 读回完整 data URL，再导入为参考图，避免修复显示后破坏后续图生图链路。
- Canvas 图片预览弹窗关闭按钮改为弹窗内部原生按钮，不再依赖通用 `Button` / Radix `Close`；在 `pointerdown` 捕获阶段直接调用 `onClose`，同时保留 Esc / `onOpenChange(false)` 关闭能力。
- 新增 `wouldCreateCanvasConnectionCycle`，在新增连接和项目连接归一化时检查从目标节点是否能走回源节点；若会成环，则忽略该连接。这样新建连接、旧项目读取和导入项目都会保持 Canvas 连接图无环。

## 4. 改动文件清单

- `src/components/canvas/CanvasNodeLayer.tsx`
- `src/components/canvas/CanvasImageNodeBody.tsx`
- `src/components/canvas/CanvasResultNodeBody.tsx`
- `src/components/canvas/CanvasImagePreviewModal.tsx`
- `src/store/canvas-store.ts`
- `src/services/canvas-projects.ts`
- `src/components/canvas/CanvasViewport.test.tsx`
- `src/components/canvas/CanvasWorkspace.test.tsx`
- `src/components/canvas/CanvasWorkspace.tsx`
- `src/store/canvas-store.test.ts`
- `src/services/canvas-projects.test.ts`
- `src/store/app-store.test.ts`
- `src/store/app-store.ts`

同时保留并继续兼容本工作树中的 local edit mask 功能改动。

## 5. 验证结果

- `pnpm exec vitest run src/components/canvas/CanvasWorkspace.test.tsx src/store/app-store.test.ts src/store/canvas-store.test.ts src/services/canvas-projects.test.ts`
  - 4 个测试文件通过，62 个测试通过。
- `pnpm exec vitest run src/components/canvas/CanvasViewport.test.tsx src/components/canvas/CanvasWorkspace.test.tsx`
  - 2 个测试文件通过，18 个测试通过；覆盖图片预览右上角关闭按钮 `pointerdown` 后弹窗移除。
- `pnpm check`
  - 33 个测试文件通过，212 个测试通过。
- `pnpm exec vitest run src/store/canvas-store.test.ts src/services/canvas-projects.test.ts`
  - 2 个测试文件通过，23 个测试通过；覆盖新增连接阻止成环，以及项目服务过滤自连接 / 重复连接 / 缺失节点 / 成环连接。
- `cargo check`
  - 通过。
- `pnpm build`
  - 通过；Vite 仍提示单个 chunk 超过 500 kB，这是现有构建告警，不阻塞本次修复。
- PixAI Dev 客户端已存在运行进程：`target\debug\pixai-tauri.exe`。

## 6. 遗留事项

- 本次未重构 Canvas 节点系统整体结构。
- 当前修复通过渲染层兼容旧项目持久化尺寸；未做数据库迁移，避免批量改写已有 Canvas 项目数据。

## 7. 2026-06-06 追加修复：Dialog 内按钮被 Canvas 拖拽层抢事件

用户复核发现：图片预览关闭按钮已能工作，但文本节点放大编辑器的关闭按钮，以及 mask 编辑器里的画笔 / 橡皮 / 清空 / 保存等普通按钮仍会点击无效。

根因是 `Dialog` 使用 portal 渲染到 body 后，React 事件仍会沿组件树冒泡回 `CanvasViewport`。Canvas 画布层在 `pointerdown` 时会进入拖拽并调用 pointer capture，导致 Dialog 内普通按钮的后续点击链路被打断；此前图片预览关闭按钮只是通过局部 `pointerdown` capture 绕开了这个问题，没有解决通用弹窗按钮。

本次修复将事件隔离收敛到 `src/components/ui/dialog.tsx`：`DialogContent` 对 `pointerdown / pointermove / pointerup / pointercancel / mousedown / click / wheel` 先调用传入 handler，再 `stopPropagation()`，避免弹窗内部交互继续冒泡到 Canvas 画布拖拽层。同步在 `src/components/canvas/CanvasViewport.test.tsx` 增加两个回归测试：

- 文本节点放大编辑器：点击默认关闭按钮后弹窗关闭，且不会触发画布 pointer capture 或 viewport commit。
- Canvas mask 编辑器：点击橡皮和保存按钮有效，保存后弹窗关闭，且不会触发画布 pointer capture 或 viewport commit。

验证结果：

- `pnpm exec vitest run src/components/canvas/CanvasViewport.test.tsx`
  - 1 个测试文件通过，11 个测试通过。
- `pnpm exec tsc --noEmit`
  - 通过。
- `pnpm check`
  - TypeScript 校验通过，33 个测试文件通过，214 个测试通过。
