# Reference Image URL Import 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-reference-image-url-import/reference-image-url-import-design.md`
> 用户终审：2026-06-05 手工测试通过

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `readRemoteImageUrl('https://example.com/cat.webp')`：实现位于 `src/lib/platform.ts:409`，返回 `ReferenceImageFilePayload` 的 `name`、`mimeType`、`dataUrl`、`fileSizeBytes`。`src/lib/platform.test.ts:73` 覆盖 HTTPS、HTTP、MIME、文件名和 base64 data URL。
- [x] `Composer` 中 `const payload = await readRemoteImageUrl(url); await importReferencePayloads([payload])`：实现位于 `src/components/workspace/Composer.tsx:206`，成功路径测试位于 `src/components/workspace/Composer.test.tsx:461`。

**名词层“现状 -> 变化”逐项核对**

- [x] `ReferenceImageFilePayload` 沿用现有类型，未新增远程参考图实体。`src/shared/types.ts:196`
- [x] `Composer` 新增组件局部状态，未进入全局 store。`src/components/workspace/Composer.tsx:35`
- [x] store/API/数据库参考图实体不变，URL 导入只在 `importReferencePayloads` 前增加来源转换节点。`src/components/workspace/Composer.tsx:216` `src/store/app-store.ts:452`
- [x] Tauri runtime 使用 `read_remote_image_url`，浏览器预览使用 fetch 兜底，两者返回同一载荷形状。`src/lib/platform.ts:409` `src-tauri/src/lib.rs:678`

**流程图核对**

- [x] “点击链接入口 -> 输入 URL -> 平台层下载 -> 转 payload -> importReferencePayloads -> AppDatabase 校验 -> 缩略条更新”均有代码落点。关键 grep：`reference-url-button`、`readRemoteImageUrl`、`read_remote_image_url`、`importReferencePayloads`。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 参考图区域新增链接入口：`src/components/workspace/Composer.tsx:320`。
- [x] 输入 HTTP/HTTPS URL 后下载图片并追加参考图：`src/components/workspace/Composer.tsx:216`，测试 `Composer.test.tsx:461`。
- [x] 不保存远程 URL 为长期外链依赖：下载结果是 data URL payload，之后走 `AppDatabase.importReferenceImages` 存储链路。

**明确不做逐项核对**

- [x] 不扫描 prompt 文本 URL：grep 未发现 prompt URL 自动提取逻辑。
- [x] 不解析网页、HTML `<img>` 或多 URL 文本：实现只接收单个输入框值，平台层只下载该 URL 的响应体。
- [x] 不修改 Provider 设置、连接测试或 OpenAI-compatible adapter：本次改动文件未触及 provider/adapters。
- [x] 不新增数量、大小、格式限制：继续沿用数据库 8 张 / 20MB / PNG,JPG,WEBP；平台层只提前拦截同一 20MB 上限。
- [x] 不把远程 URL 直接存成参考图字段：`ReferenceImage` / `Conversation` 未新增 URL 字段。

**关键决策落地**

- [x] D1 URL 导入放在 `Composer` 参考图工具区。
- [x] D2 用户必须显式点链接入口，不自动解析 prompt。
- [x] D3 下载节点输出 `ReferenceImageFilePayload` 后复用 `importReferencePayloads`。
- [x] D4 `Content-Length` 超过 20MB 直接拒绝，缺失时流式累计超过 20MB 中止。
- [x] D5 Tauri / 浏览器两端同形返回。
- [x] D6 requirement 边界已更新。

**流程级约束核对**

- [x] 错误语义可见：弹窗错误 + notify，测试覆盖 404 失败。
- [x] 幂等性：每次成功确认都调用一次 `importReferencePayloads([payload])`，不做 URL 去重。
- [x] 单 URL：UI 只有一个输入框，平台函数一次返回单个 payload。
- [x] 数据持久化：先转换为 data URL payload，再进入既有数据库导入。
- [x] 可观测点：导入中按钮禁用，空输入提交禁用，失败显示 role=alert。

**挂载点反向核对**

- [x] `Composer` 参考图工具区：`reference-url-button` 是唯一用户入口。
- [x] 平台图片读取接口：`readRemoteImageUrl` / `read_remote_image_url` 是唯一下载转换入口。
- [x] requirement：`reference-image-input.md` 已从“不负责远程 URL”更新为“显式链接入口”。
- [x] 反向 grep：feature 关键词只命中 `Composer`、`platform`、Tauri command、测试和 CodeStable 文档，未发现设计外挂载点。
- [x] 拔除沙盘推演：删除按钮/Dialog + `readRemoteImageUrl` + requirement 更新后，本 feature 入口消失；剩余参考图本地导入链路仍可独立工作。

## 3. 验收场景核对

- [x] HTTPS URL 成功导入：单测 `platform.test.ts:73` + `Composer.test.tsx:461`。
- [x] HTTP URL 成功导入：单测 `platform.test.ts:109`。
- [x] 空 URL 不下载：单测 `Composer.test.tsx:427` 验证确认按钮禁用。
- [x] ftp URL / 普通文本不下载：`readRemoteImageUrl` 协议校验，单测 `platform.test.ts:129`。
- [x] 404 / 500 失败且会话不变：404 单测覆盖平台错误；Composer 失败路径不调用 `importReferencePayloads`。
- [x] HTML / JSON / 非 PNG,JPG,WEBP 失败：HTML 单测 `platform.test.ts:145`。
- [x] `Content-Length` 超过 20MB 不读 body：单测 `platform.test.ts:161` 验证 `getReader` 未调用。
- [x] 缺失或不可信 `Content-Length` 时流式超限中止：单测 `platform.test.ts:184` 验证 `cancel` 和 `releaseLock`。
- [x] 已达 8 张参考图沿用既有限制：URL 成功后仍走 `importReferencePayloads` -> `AppDatabase.importReferenceImages`，没有新增绕过路径。`src/services/app-database.ts:225` `src/services/app-database.ts:412`

**前端浏览器验证**

- [x] Browser Bridge 检查结果：server 可启动，但当前 Chrome 扩展无 connected tab，无法使用该桥。
- [x] 兜底验证：使用临时 headless Chrome + CDP 打开 `http://localhost:1420/`，点击“通过链接添加参考图”。DOM 证据：`ok=true`、标题为“通过链接添加参考图”、输入框 `type=text` / `inputMode=url`、空输入提交按钮禁用。
- [x] 截图证据：`.codestable/features/2026-06-05-reference-image-url-import/reference-image-url-import-dialog.png`

## 4. 术语一致性

- 参考图：沿用 `ReferenceImage` / `conversation.referenceImages`，未新增“远程参考图”实体。
- 图片 URL 导入：代码命名集中为 `readRemoteImageUrl`、`read_remote_image_url`、`remoteImageUrl`，与方案术语一致。
- 远程图片载荷：实现输出 `ReferenceImageFilePayload`，字段一致。
- 防冲突 grep：`remote/url` 在共享类型中只命中既有 provider/update 字段和 `dataUrl`，未新增参考图 URL 字段。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已把 `Composer` 的参考图入口更新为本地文件、粘贴/拖入、Tauri 路径和显式 HTTP/HTTPS 图片链接。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已记录 `readRemoteImageUrl` / `read_remote_image_url` 的平台分支、payload 形状和 20MB 下载约束。
- [x] 架构总入口：本 feature 未新增子系统，不需要改总入口。

## 6. requirement 回写

- [x] 方案 frontmatter 指向 `requirement: reference-image-input`。
- [x] `reference-image-input` 是 current req，本次改了用户故事、pitch、边界和变更日志，已按实际能力更新。
- [x] 新边界：只通过显式链接导入入口下载 HTTP/HTTPS 图片；不自动解析 prompt、网页或 HTML。

## 7. roadmap 回写

- [x] 方案 frontmatter 未填写 `roadmap` / `roadmap_item`。
- [x] 结论：非 roadmap 起头，跳过 roadmap items.yaml 和 roadmap 主文档回写。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 attention.md 的新常驻事项。真实 Tauri 客户端测试命令 `pnpm dev:client` 已存在于 attention.md。

## 9. 遗留

- 后续优化点：`src/lib/platform.ts` 平台 I/O 能力偏集中；若继续增长，建议后续单独走 `cs-refactor` 评估拆分，不在本 feature 中处理。
- 已知限制：不支持多 URL 批量输入、网页解析、HTML `<img>` 抽取、URL 去重或内容 hash 去重。
- 实现阶段顺手发现：无额外问题被偷偷修复。
