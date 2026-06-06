# Workspace Canvas Shell Split 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-06
> 关联方案 doc：`.codestable/features/2026-06-06-workspace-canvas-shell-split/workspace-canvas-shell-split-design.md`
> 用户终审：待用户确认；本报告已完成类型检查、定向测试、跨页面组件测试、浏览器交互 smoke 和架构归并

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `WorkspaceShell(props: AppShellProps)`：实现位于 `src/components/layout/WorkspaceShell.tsx`，组合 `AppTopNav`、普通会话侧栏、`Workspace` children 和 `SettingsPanel`，参数栏按钮由 `workspaceActions` 注入。
- [x] `CanvasShell(props: AppShellProps)`：实现位于 `src/components/layout/CanvasShell.tsx`，组合 `AppTopNav`、Canvas project 侧栏和 `CanvasWorkspace` children，不导入 `SettingsPanel` / `WorkspaceConfigPanel`。
- [x] `SharedLibraryShell(props: AppShellProps & { children })`：实现位于 `src/components/layout/SharedLibraryShell.tsx`，只提供 `AppTopNav` 和共享页面容器。
- [x] `AppTopNav`：实现位于 `src/components/layout/AppTopNav.tsx`，承载品牌、工作台 / Canvas / 图库 / 提示词库导航、主题切换和全局设置入口；Workspace 专属操作由 `workspaceActions` 传入。
- [x] `toggleSettings()`：实现位于 `src/store/app-store.ts`，当前只执行 `settingsVisible: !state.settingsVisible`，不再写入 `view`。

**名词层“现状 -> 变化”逐项核对**

- [x] `MainLayout` 已从单一全局外壳移除；`src/App.tsx` 直接按 `view` 渲染 `WorkspaceShell` / `CanvasShell` / `SharedLibraryShell`。
- [x] 工作区参数栏从 App 跨模式布局收窄为 WorkspaceShell 内部布局。
- [x] Canvas 项目侧栏从旧 Layout 内部分支提升为 CanvasShell 固有结构。
- [x] Gallery / Prompt Library 不再继承 Workspace 或 Canvas 侧栏，统一走 SharedLibraryShell。

**流程图核对**

- [x] “App 读取 view -> workspace -> WorkspaceShell -> 普通会话侧栏 / Workspace / WorkspaceConfigPanel”有代码落点：`src/App.tsx`、`WorkspaceShell.tsx`、`SettingsPanel`。
- [x] “App 读取 view -> canvas -> CanvasShell -> Canvas 项目侧栏 / CanvasWorkspace”有代码落点：`src/App.tsx`、`CanvasShell.tsx`、`CanvasWorkspace`。
- [x] “App 读取 view -> gallery/prompts -> SharedLibraryShell -> 共享顶部导航 / 页面内容”有代码落点：`src/App.tsx`、`SharedLibraryShell.tsx`、`GalleryPage`、`PromptLibraryPage`。
- [x] `GlobalSettingsModal` 仍由 `App` 统一挂载，三类 shell 只接收 `onOpenGlobalSettings`。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 经典工作台进入 WorkspaceShell：组件测试验证工作台下显示“新建会话”和“参数栏”，浏览器 smoke 验证工作台页面有参数栏入口。
- [x] Canvas 进入 CanvasShell：组件测试和浏览器 smoke 均验证 Canvas 下显示“Canvas 项目 / 新建 Canvas 项目”，且没有“参数栏”按钮。
- [x] WorkspaceShell 侧栏只表达普通会话：`ShellLayout.test.tsx` 覆盖隐藏 Canvas conversation 不出现在普通会话侧栏。
- [x] CanvasShell 侧栏只表达 Canvas project：`ShellLayout.test.tsx` 覆盖 Canvas 项目导航可见且“新建会话”不可见。
- [x] Gallery / Prompt Library 使用 SharedLibraryShell：组件测试和浏览器 smoke 验证共享页没有普通会话侧栏或 Canvas project 侧栏，仍可打开全局设置。
- [x] `settingsVisible` / `toggleSettings()` 只表达 Workspace 参数栏显隐：`app-store.test.ts` 覆盖从 `canvas` 调用 `toggleSettings()` 后 view 不变。

**明确不做逐项核对**

- [x] 不重写 Canvas 节点系统、workflow run、生成桥、history/gallery 来源协议：本 feature 的新增 layout 文件只引用 shell、store action 和 Canvas project summary；未修改 `canvas-workflow` / `ImageService` / history schema。
- [x] 不拆图库或提示词库为两份：`src/App.tsx` 中 `gallery` / `prompts` 仍渲染原有 `GalleryPage` / `PromptLibraryPage`，只是外壳换为 SharedLibraryShell。
- [x] 不新增 Canvas inspector / 节点属性面板：`CanvasShell` 只包含项目侧栏和 main content，无 inspector 状态或 UI。
- [x] 不拆分 Provider settings、Tauri API 或本地数据库结构：本 feature 只改 App/layout/app-store 的参数栏 action 和测试；未改 Provider / Tauri / app-database 接口。
- [x] 不做大规模 store 分层：只修正 `toggleSettings()` 语义，未拆 `useAppStore`。

**关键决策落地**

- [x] D1 从“一个 MainLayout 内部分支”改为“App 按 view 选择 Shell”：`src/App.tsx` 中四个 view 分支分别挂载三类 Shell。
- [x] D2 WorkspaceShell 拥有参数栏语义：`settingsVisible`、`toggleSettings()`、`SettingsPanel` 都只在 `WorkspaceShell` 中参与布局。
- [x] D3 CanvasShell 不渲染 Workspace 参数栏入口：反向 grep 显示 `WorkspaceConfigPanel` / `SettingsPanel` / “参数栏”只命中 `WorkspaceShell.tsx` 和测试断言。
- [x] D4 共享页使用 SharedLibraryShell：Gallery / Prompt Library 均由 `SharedLibraryShell` 包裹，未带模式专属侧栏。
- [x] D5 保留 Canvas project 侧栏模型：CanvasShell 继续调用 `createCanvasProject`、`openCanvasProject`、`deleteCanvasProject` 和 `useCanvasStore().projects`，没有重定义生命周期。

**流程级约束核对**

- [x] `toggleSettings()` 不允许改变 `view`：`src/store/app-store.ts` 实现不写 `view`，`app-store.test.ts` 覆盖。
- [x] CanvasShell 不允许导入或渲染 `WorkspaceConfigPanel`：源码 grep 确认 layout 目录中只有 `WorkspaceShell.tsx` 导入 `SettingsPanel` 并渲染“参数栏”。
- [x] WorkspaceShell 不读取 `useCanvasStore().activeProject` 决定主布局：只读取 `projects` 用于过滤 Canvas 绑定会话。
- [x] SharedLibraryShell 不渲染模式专属侧栏：源码只包含 `AppTopNav` 和 `main`。
- [x] 从 Gallery / Prompt Library 访问 Canvas 仍走现有业务 action：本 feature 未改 `addHistoryToCanvas()` 或 Gallery 页面业务入口。

**挂载点反向核对**

- [x] `src/App.tsx`：页面外壳选择从单一 `MainLayout` 改为 `WorkspaceShell` / `CanvasShell` / `SharedLibraryShell`。
- [x] `src/components/layout/`：新增 `AppTopNav.tsx`、`WorkspaceShell.tsx`、`CanvasShell.tsx`、`SharedLibraryShell.tsx` 和 `ShellLayout.test.tsx`；旧 `MainLayout.tsx` / `MainLayout.test.tsx` 删除。
- [x] `src/store/app-store.ts`：`toggleSettings()` 去掉 `view: 'workspace'` 副作用。
- [x] `src/store/app-store.test.ts`：补充 `toggleSettings` 不改变 active view 的测试。
- [x] `.codestable/architecture/ARCHITECTURE.md` 与 `.codestable/architecture/ui-shadcn-workbench.md`：已归并 Shell 分流现状。
- [x] 反向 grep：`rg -n "MainLayout" src -g "*.ts" -g "*.tsx"` 无命中；`rg -n "WorkspaceConfigPanel|SettingsPanel|参数栏" src\components\layout` 只命中 `WorkspaceShell.tsx` 和测试。
- [x] 拔除沙盘推演：移除本 feature 时，按清单恢复 `App` 的 Layout 包裹、删除四个新 Shell 文件、恢复 `toggleSettings()` 旧语义和旧测试即可回到旧耦合结构；未留下 Provider / Canvas workflow / database 层残留。

## 3. 验收场景核对

- [x] **S1**：启动后进入工作台 -> 页面使用 WorkspaceShell，左侧显示普通会话，顶部有“参数栏”按钮。
  - 证据来源：`ShellLayout.test.tsx` + Playwright smoke。
  - 结果：通过。
- [x] **S2**：工作台点击“参数栏” -> 只切换右侧参数栏显隐，`view` 仍为 `workspace`。
  - 证据来源：`ShellLayout.test.tsx`。
  - 结果：通过。
- [x] **S3**：进入 Canvas -> 页面使用 CanvasShell，左侧显示 Canvas 项目，顶部没有“参数栏”按钮。
  - 证据来源：`ShellLayout.test.tsx` + Playwright smoke。
  - 结果：通过。
- [x] **S4**：Canvas 新建 / 切换 / 删除项目入口仍在 Canvas 项目侧栏中。
  - 证据来源：`CanvasShell.tsx` review + `ShellLayout.test.tsx` 验证“新建 Canvas 项目”可见。
  - 结果：通过。
- [x] **S5**：进入图库 -> 使用 SharedLibraryShell，不显示普通会话侧栏或 Canvas 项目侧栏，仍可打开全局设置。
  - 证据来源：`ShellLayout.test.tsx` + Playwright smoke。
  - 结果：通过。
- [x] **S6**：进入提示词库 -> 使用 SharedLibraryShell，不显示模式专属侧栏，仍可回到工作台 / Canvas。
  - 证据来源：Playwright smoke 依次点击“提示词库 / 工作台 / Canvas”导航。
  - 结果：通过。
- [x] **S7**：图库成功图“加入 Canvas”仍通过现有业务 action，不依赖 SharedLibraryShell 持有 Canvas 状态。
  - 证据来源：源码 review；本 feature 未改 `GalleryPage`、`ImageTile` 或 `addHistoryToCanvas()`。
  - 结果：通过。

**前端浏览器验证**

- [x] `pnpm exec tsc --noEmit`：通过。
- [x] `pnpm exec vitest run src/components/layout/ShellLayout.test.tsx src/store/app-store.test.ts`：2 个测试文件、36 个用例通过。
- [x] `pnpm exec vitest run src/components/layout/ShellLayout.test.tsx src/store/app-store.test.ts src/components/canvas/CanvasWorkspace.test.tsx src/components/gallery/GalleryPage.test.tsx src/components/prompts/PromptLibraryPage.test.tsx`：5 个测试文件、49 个用例通过。
- [x] Playwright smoke：临时启动 `pnpm exec vite --host 127.0.0.1 --port 5179`，打开 `http://127.0.0.1:5179`，验证工作台有“参数栏”、Canvas 无“参数栏”且有 Canvas 项目侧栏、图库和提示词库均无模式专属侧栏；验证结束后已停止 Vite 进程。

## 4. 术语一致性

- `WorkspaceShell`：代码命中集中在 `src/App.tsx`、`src/components/layout/WorkspaceShell.tsx`、`ShellLayout.test.tsx`，与方案命名一致。
- `CanvasShell`：代码命中集中在 `src/App.tsx`、`src/components/layout/CanvasShell.tsx`、`ShellLayout.test.tsx`，与方案命名一致。
- `SharedLibraryShell`：代码命中集中在 `src/App.tsx`、`src/components/layout/SharedLibraryShell.tsx`、`ShellLayout.test.tsx`，与方案命名一致。
- `AppTopNav`：代码命中集中在三类 Shell 和 `AppTopNav.tsx`，对应方案中的共享应用级 chrome。
- `toggleSettings`：代码实现和测试均使用“切换参数栏显隐，不导航”的新语义。
- 防冲突：`MainLayout` 在 `src/**/*.ts(x)` 无命中；架构文档旧锚点已改为三类 Shell。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已新增 `AppTopNav`、`WorkspaceShell`、`CanvasShell`、`SharedLibraryShell` 术语；前端工作台布局索引已从 `MainLayout` 改为 `App` + 三类 Shell；硬边界已写入“工作区参数栏只属于 WorkspaceShell、共享页不继承模式侧栏”。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已更新 summary 和 `last_reviewed`；“应用 Shell 与页面路由”已描述 App 按 view 选择三类 Shell；“Canvas 模式”已补充 CanvasShell 拥有项目侧栏；代码锚点和已知约束已替换为新 Shell 结构。
- [x] 无需更新 `.codestable/attention.md`：本 feature 没有暴露新的每轮都必须知道的环境 / 命令硬约束。

## 6. requirement 回写

- [x] design frontmatter 的 `requirement` 为空。
- [x] 本 feature 是 UI 主界面外壳结构分离和导航副作用修正，未新增一个独立能力愿景文档；用户可见行为已由 feature design / acceptance 和 architecture 记录。
- [x] 结论：无 requirement 回写；未修改 `.codestable/requirements/`。

## 7. roadmap 回写

- [x] design frontmatter 未设置 `roadmap` / `roadmap_item`。
- [x] 结论：非 roadmap 起头；无需修改 `.codestable/roadmap/`。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露新的项目常驻事项。真实 Tauri 客户端测试使用 `pnpm dev:client` 的约束已存在于 `.codestable/attention.md`，本次不重复新增。

## 9. 遗留

- 后续优化点：`src/store/app-store.ts` 仍偏胖；本 feature 只修正 `toggleSettings()` 语义，不做 store 分层。
- 后续优化点：如果后续 Canvas 需要 inspector / project panel，应另起 Canvas 专属状态和组件，不能复用 Workspace 的 `settingsVisible`。
- 已知限制：本 feature 不实现 Canvas inspector、节点属性面板或 Canvas 业务能力扩展。
- 实现阶段顺手发现：`ShellLayout.test.tsx` 运行时暴露 `WorkspaceConfigPanel` / `SettingsToggleRow` 内部嵌套 button 的 React warning；该问题与本 feature 的 Shell 分离无直接关系，建议后续单独走 issue 或 refactor 处理。
