# PixAI Tauri 架构总入口

> 状态：已更新
> 创建日期：2026-05-23

## 1. 项目简介

PixAI rebuilt as a Tauri 2 desktop app.

## 2. 核心概念 / 术语表

- **工作区参数栏**：工作台右侧的高频参数编辑层，仅承载当前会话的生图参数与引擎选择。
- **全局设置窗**：应用级低频配置层，承载通知、更新、服务配置、Codex 扩展等全局状态。
- **Provider 管理流**：在全局设置窗内维护图片 / 提示词 Provider 的默认选择、列表维护与编辑弹窗。

## 3. 子系统 / 模块索引

- **前端工作台布局**
  - `src/components/layout/MainLayout.tsx`
  - `src/App.tsx`
  - 负责工作台、左侧导航、右侧工作区参数栏、全局设置窗挂载。
- **设置系统**
  - `src/components/settings/workspace/`
  - `src/components/settings/global/`
  - `src/components/settings/providers/`
  - 负责把“当前会话参数”和“应用级设置”拆成两层编排。

## 4. 关键架构决定

- 设置系统采用双层结构：右侧 `WorkspaceConfigPanel` 负责高频会话参数，`GlobalSettingsModal` 负责低频应用级配置。
- Provider 维护不再和工作区参数混排，而是作为 `Services` 分区内的独立管理流存在。
- 更新、通知权限、技能安装统一按状态卡表达，减少和普通表单字段的视觉冲突。

## 5. 已知约束 / 硬边界

- 高频生图参数必须在工作区一层内可达，不能被多级导航或二级弹窗包裹。
- 打开全局设置窗不能打断当前会话上下文，也不能清空正在编辑的 prompt。
- 本地通知、更新、服务配置和扩展属于全局层，不应重新回流到工作区参数栏。
