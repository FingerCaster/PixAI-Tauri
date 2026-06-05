---
doc_type: feature-brainstorm
feature: 2026-06-05-reference-image-url-import
status: confirmed
summary: 支持用户通过 HTTP/HTTPS 图片链接导入参考图
tags: [workspace, composer, reference-image, url-import]
---

# Reference Image URL Import Brainstorm

> Stage 0 | 2026-06-05 | 下一步：design

## 想做什么、为什么

用户想在现有参考图入口中新增 HTTP/HTTPS 链接导入能力。现有 `reference-image-input` 已支持粘贴 / 拖入本地图片，但明确不负责从网页地址下载远程图片；这次讨论确认要把这个边界扩展出来，让用户可以直接贴图片 URL 并追加到当前会话参考图。

## 考虑过的方向

### 方向 A：显式“链接导入”入口

- 描述 / 价值 / 代价：在参考图入口旁新增按钮或弹窗，用户填 `http://` / `https://` 图片 URL，应用下载后复用现有参考图导入链路。入口明确，不会误吞 prompt 文本；代价是多一次点击。
- 结论：选定。这个方向最符合当前工作台的低打扰交互，也能把错误提示集中在导入动作内。

### 方向 B：自动识别 prompt 文本中的 URL

- 描述 / 价值 / 代价：用户在 prompt 文本里粘贴 URL 后自动识别为参考图。少一次点击，但容易误把提示词中的网页链接、描述性 URL 或非图片资源吞掉。
- 结论：否决。误判成本高，而且会改变提示词输入语义。

### 方向 C：当作 Provider 服务连接能力

- 描述 / 价值 / 代价：把 HTTP(S) 连接理解为服务配置里的 Provider endpoint 连接测试或新增接口类型。
- 结论：否决。用户确认选择的是参考图 URL 导入，不是服务配置连接。

## 已敲定的设计点

- 已确认：本 feature 的目标是“参考图 URL 导入”，不是 Provider HTTP(S) 服务连接。
- 已确认：只支持显式输入 `http://` / `https://` 图片 URL，不扫描 prompt 文本。
- 已确认：下载后的图片继续走现有参考图数量、格式和大小校验，不新增平行参考图模型。
- 已确认：Tauri runtime 下应走桌面侧 HTTP 能力下载，避免 WebView / 浏览器 CORS 阻塞真实客户端体验。
- 待验证：浏览器预览环境是否保留直接 `fetch` 兜底；design 阶段倾向保留，以便组件测试和 Vite 预览可用。

## 选定方向与遗留问题

选定方向是给参考图区域增加一个显式 URL 导入支线：用户点击链接入口，输入 HTTP/HTTPS 图片地址，应用下载图片并追加到当前会话参考图缩略条。明显不做自动识别 prompt URL、不改 Provider 服务连接、不保存远程 URL 本身作为引用源。

design 阶段需要细化的重点是：URL 下载结果如何转换为 `ReferenceImageFilePayload`、错误语义如何呈现、以及是否需要把既有 `reference-image-input` requirement 中“不负责远程 URL”的边界同步更新。
