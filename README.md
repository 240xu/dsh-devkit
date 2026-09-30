# @240xu/dsh-devkit
<!-- TODO(截图): 真机截图替换占位图（本轮无浏览器通道，不硬造） -->

> 把 VS Code 的核心开发者体验移植进 DSH web 端：**命令面板 + 快捷键层 + Toast 通知 + 开发者信息**，全部 overlay 化，**侧边栏零改动**。

![命令面板截图占位](docs/screenshot-palette.png)
![快捷键速查表截图占位](docs/screenshot-shortcuts.png)

## 功能

| 功能 | 入口 | 说明 |
| --- | --- | --- |
| 命令面板 | `Ctrl+K` / `Ctrl+Shift+P`，或会话头部 🔍 按钮 | 全屏毛玻璃弹层，输入即过滤（支持中文、关键词、命令 id），`↑↓` 导航、`Enter` 执行、`Esc` 关闭；无匹配时显示「没有匹配命令」并提示快捷键 |
| 切换会话 | 面板输入「切换 / session」 | 列出最近会话，回车直接打开 |
| 新建会话 | 面板「新建」 | 走宿主 sessions 服务的 create 接口（不可用时给出提示） |
| 删除当前会话 | 面板「删除」 | 转发 `/__chameleon/session/delete`（需安装 @huanlin/dsh-plugin-session-delete），成功后刷新列表并打开下一个会话 |
| 导出会话 Markdown | 面板「导出」 | 通过 `/api/message-ops/messages` 拉取消息（需安装 @240xu/dsh-message-ops），生成大纲级 Markdown 下载；插件不在时优雅降级提示 |
| 消息操作面板 | 面板「消息操作」 | 转发 `dsh-message-ops:open` 事件唤起 message-ops 的回滚/删除/分支对话框 |
| Websearch 设置 | 面板「websearch」 | 派发 `dsh-websearch:open-settings` 事件并给出指引提示 |
| 快捷键速查表 | `Ctrl+K` `Ctrl+S`（和弦） | 列出 devkit 全部键位 + 各命令声明键位 |
| Toast 通知 | API | 右下角堆叠、自动消失、CSS 动画，四类配色 |
| 开发者信息 | 面板输入「dev info」 | profile、DSH 版本（`/api/pair/status`，不可用则降级 UA）、当前会话 id、命令注册来源、插件版本 |

HTTP 端点（只读）：

- `GET /api/devkit/commands` —— 内置命令清单 JSON（供外部工具/文档消费）
- `GET /api/devkit/health` —— 插件存活与版本信息

## 为什么不占侧边栏

**用户明确要求侧边栏零改动**，本插件把这一点作为硬约束，而不是折中：

1. **交互范式天然匹配**。VS Code 的命令面板本身就是全屏 overlay（浮在编辑器上方），不是侧边栏。移植它的开发者体验，正确的载体就是 `shell.overlay` 槽——居中顶部、毛玻璃背景、输入即过滤，与宿主的会话弹层同一套渲染管线，不会挤压工作区。
2. **可达性靠两件事补齐**：会话头部的 🔍 按钮（`conversation.session.header.actions` 槽，也是既有兼容面）提供鼠标入口；`Ctrl+K` 提供键盘入口。不占任何常驻空间。
3. **零布局风险**。overlay 不改变宿主 flex/grid 结构，不与现有侧边栏插件（better-sidebar 等）争抢位置，主题切换、窄屏、HMR 重建都不会产生残留布局。
4. **对其它插件零侵入**。贡献点（见下）只要求对方调用 `window.__dshDevkit.registerCommand(...)`，不需要协调任何侧边栏注册面。

因此本插件只使用三个既有兼容面：`shell.overlay`、`conversation.session.header.actions`、自持 HTTP 端点。

## 给插件作者：注册你的命令（contribution point）

```js
const unregister = window.__dshDevkit.registerCommand({
  id: 'my-plugin.do-thing',              // 建议以插件名为前缀
  title: '执行我的操作',                  // 也支持 titleZh / titleEn 分语言
  shortcut: 'Ctrl+Alt+M',                // 可选，仅展示在面板与速查表
  keywords: ['我的', 'thing'],            // 可选，过滤命中词
  run: () => { /* 执行 */ },              // 返回值可为 Promise
})
// unregister() 可随时撤下
```

Toast 同样开放：

```js
window.__dshDevkit.toast('分支完成', { kind: 'ok', timeoutMs: 3000 })
// kind: 'info' | 'ok' | 'warn' | 'error'
```

重复 id 注册会抛错，保证命令来源可追溯。

## 键位与输入框豁免

- 监听在 **capture 阶段**，`Ctrl+K` 先于页面大多数处理。
- 事件目标为 `input` / `textarea` / `contentEditable` 时，除 `Esc`（仅用于关闭 devkit 弹层）外**不拦截任何键**——聊天输入框、搜索框、其它插件的表单不受影响。
- 和弦语义：`Ctrl+K` 立即打开面板并武装和弦，1.5s 内 `Ctrl+S` 切换为快捷键速查表（输入框里打字不会误触，因为豁免规则先于和弦生效）。未消费的 `Ctrl+S` 仍走浏览器默认行为。

## 安装

```bash
# 已发布 npm 包后（web profile）
dsh plugin --profile web add @240xu/dsh-devkit
```

Windows / Termux 本地路径安装（未发包时）：

```bash
# Windows (PowerShell)
dsh plugin --profile web add "file:///C:/Users/you/dsh-plugins-src/dsh-devkit"

# Termux / Linux
dsh plugin --profile web add "file:///data/data/com.termux/files/home/dsh-plugins-src/dsh-devkit"
```

安装后刷新 web 页面即可。

## 兼容性

- Node ≥ 20；零 npm 依赖（服务端仅 `node:fs/path/os/url`，客户端纯 `React.createElement`）。
- locale：跟随宿主 `locale` 服务做 zh/en 双语；服务缺失时按浏览器语言回退。
- 各能力按依赖存在与否**独立降级**：session-delete 未装则删除命令报错提示；message-ops 未装则导出/消息操作提示不可用；sessions 服务缺失则延迟注入等待。

## 开发

```bash
npm test          # node --test，26 个用例：命令过滤/和弦状态机/输入框豁免/health 端点
```

浏览器端 UI 无法单测，交付前以 `node --check` 保证三个源文件语法，并以真实 web profile 验证面板交互。

## License

MIT

## Changelog

### 0.1.1（评审修复第一轮）

- 【P0】焦点陷阱：面板打开时 Tab 不再穿透到背景页；关闭时焦点还原到打开前的元素；dialog 补 `aria-modal="true"`（fe-ui D1/D2）。
- 【P0】死命令防护：`devkit.websearch.settings` 改为探测式派发——优先读 `window.__dshWebsearchSettingsReady` 就绪标志，否则监听 `dsh-websearch:open-settings:ack` 应答，300ms 无应答 toast「Websearch 设置暂不可用」（pm-a P0）。
- 【P1】backdrop 去掉第二层 `backdrop-filter`，改纯色遮罩 `rgba(0,0,0,.45)`，低端安卓不再双全屏模糊合成（fe-ui D3）。
- 【P1】「删除当前会话」加确认弹层（会话名+id+运行中警告+危险按钮，Esc/取消可退），不再一键即删。
- 【P1】`registerCommand` 同 id 幂等去重：同 run 返回原注销函数，冲突 run `console.warn` 并忽略，不再 throw（suite 共识修订）。
- 【P1】Toast 容器补 `role="status" aria-live="polite"`；toast 动画加 `prefers-reduced-motion` 关断（fe-ui D4/D5）。
- core.js / client.js 双源薄拷贝加互指头注释，新增 `test/consistency.test.js` 关键函数哈希一致性快照测试。

### 0.1.2（R3 收尾）

- 【N1·P1】confirmDelete 弹层 Tab 在「删除/取消」两按钮间首尾循环，与全局焦点陷阱一致。
- 【N2·P3】client VERSION 更新为 0.1.2，注明 classic-script 无法 import package.json、以字面量+同步注释为单一来源。
- 【D2】面板输入框补 `role="combobox" aria-expanded aria-controls="devkit-list" aria-activedescendant`，列表项补 `id="devkit-opt-N"`，读屏可朗读「第 N 项已选中」。

## 命令面板模式前缀（0.2.0，VS Code 范式）

| 输入前缀 | 模式 | 行为 |
| --- | --- | --- |
| 无前缀 | 混合模式 | 命令 + 会话标题同时过滤，MRU（最近使用）优先 |
| `>` | 命令模式 | 只搜命令（现状默认行为的显式形式） |
| `#` | 会话搜索 | 标题匹配（sessions 服务）+ 全文搜索（需 dsh-session-search，探测 `/api/session-search/health` 通过后启用）；全文结果点击 = 打开会话并 toast 命中 `#seq · 上下文摘要` |
| `@` | 插件分组 | 命令按注册来源（id 前缀）分组排序，badge 显示来源 |

### MRU

最近执行的 20 条命令记录在 `localStorage`（key `dsh-devkit-mru`，环形上限 20，去重置顶），面板中排前并带「最近」标记；刷新后仍生效。

### 0.2.0 新增内置命令

- **复制当前会话 ID**（始终可用；非安全上下文回退 execCommand）
- **搜索会话历史…**（仅当 `GET /api/session-search/health` 探测通过才注册；进入 `#` 全文搜索模式；session-search 面板深链待 W2 发现方案敲定）
- **打开 lazy-view 面板…**（仅当 `GET /lazyview` 探测 200 才注册；新标签页打开）——补上 pm-a 评审指出的 lazy-view「无入口」P0 缺口

### 协作矩阵（哪些命令依赖哪些插件存在）

| 命令 / 能力 | 依赖 | 探测方式 | 缺失时行为 |
| --- | --- | --- | --- |
| 删除当前会话 | @huanlin/dsh-plugin-session-delete | 调用时 404 | toast 报错 |
| 导出会话 Markdown / 消息操作面板 | @240xu/dsh-message-ops | 调用时状态码 / 事件无响应 | toast 提示不可用 |
| Websearch 设置 | @240xu/dsh-websearch | `__dshWebsearchSettingsReady` 标志或 300ms ack | toast「暂不可用」 |
| 搜索会话历史 / `#` 全文搜索 | dsh-session-search（W2 新插件） | `GET /api/session-search/health` | 命令不注册；`#` 降级为标题匹配 |
| 打开 lazy-view 面板 | session-lazy-view | `GET /lazyview` → 200 | 命令不注册 |
| 切换/新建会话、会话标题搜索、复制 ID | 宿主 sessions 服务 | ctx.inject 延迟注入 | toast 提示 |

## 权威依据与取舍（0.2.1 整洁度 pass）

| # | 依据 | 结论 |
| --- | --- | --- |
| 1 | [WAI-ARIA APG Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) | **部分采纳**。已符合：DOM 焦点驻留 combobox + `aria-activedescendant` 指向 option、`aria-controls`/`aria-expanded`、Enter 接受选项、Esc 关闭 popup、可打印字符照常输入（APG 明确要求 JS 不得干扰浏览器原生文本编辑键——我们只拦截 Tab/Esc/箭头/Enter）。本轮补上 `aria-autocomplete="list"`。**拒绝** PageUp/PageDown 与 Home/End 选项跳转（APG 标注 Optional）：面板列表通常 <30 项、↑↓ 已覆盖；Home/End 保持浏览器原生文本光标行为，与 APG「可编辑 combobox 支持平台标准文本编辑键」一致。 |
| 2 | [VS Code Quick Open 的 fuzzy 匹配](https://code.visualstudio.com/docs/getstarted/userinterface#_quick-open)（实现为 subsequence 打分，见 microsoft/vscode `fuzzyScorer.ts`） | **拒绝本轮升级，留给 roadmap 模糊匹配阶段**。理由：(a) 当前 token-AND 子串匹配已覆盖中英与 id 命中场景，zh 无空格分词使 subsequence 误召率高；(b) 命令数 <500 时 O(n·m) 性能完全可接受（每键重算 <1ms），收益是排序质量而非可行性；(c) subsequence 打分涉及首字母/连字符边界权重，需配套 MRU 权重融合，属独立迭代。 |
| 3 | localStorage vs 内存 + storage 事件（MRU 持久化） | **采纳 localStorage**。roadmap W1 验收标准明确「MRU 数据刷新后重开面板仍生效」，内存方案不满足；storage 事件跨 Tab 同步对本场景无需求（MRU 是个人偏好态，弱一致性可接受）。try/catch 包裹读写，隐私模式/配额满时静默降级为会话内 MRU。 |
| 4 | [MDN prefers-contrast](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast) | **采纳（轻量）**。在 prefers-reduced-motion 之外补充 `@media (prefers-contrast: more)`：toast 边框加粗 + 字重 600，用既有 --dsw 令牌不引入新色值。未做完整高对比度主题（宿主主题系统职责，越界）。 |

本轮整洁度 pass 附带：palette 纯逻辑下沉 core.js（`pluginSource`/`sortCommandsBySource`/`normalizeSearchResults`，client 只留薄壳，consistency 快照同步扩展）；命名统一 `palKind`→`palMode`（与 `parsePaletteQuery().mode` 对齐）；错误 toast 统一携带 `[命令 id]` 定位；死代码清理（无生产者的 `sessionPick` 分支、未引用的 `__closeOverlay`、MRU key 字面量改用 `MRU_KEY` 常量）。

### 0.2.2（W2 协作接线收尾）

- 新增命令**打开会话搜索面板…**（`devkit.searchPanel`）：`window.open('/api/session-search/panel')`，与「搜索会话历史」同受 `GET /api/session-search/health` 探测门控。
- 探测端点 URL 与 dsh-session-search v0.1.0 实际契约核对一致：`/api/session-search/health`（探测）、`/api/session-search/search?q=`（全文）、`/api/session-search/panel`（面板页，本轮新增深链——0.2.0 时预留的「发现方式待 W2 敲定」事项落地）。

### 0.2.3（审计修复轮）

- 【盲区 B1】VERSION 三处一致性守卫：`test/consistency.test.js` 新增断言，package.json / core.js / client.js 三处版本字符串正则提取比对，漂移即测试红（与本轮 0.2.3 三处同步 bump 自证）。
- 【P2】`npm test` 脚本 Windows 兼容：未加引号的 shell glob `test/*.test.js` 在 cmd.exe 下不展开、`node --test <目录>` 在部分 Node 构建下报 MODULE_NOT_FOUND——改为零依赖 runner `scripts/run-tests.js`（node:fs globSync 在进程内取文件清单后 spawn `node --test <files>`），POSIX/Windows 行为一致，保留默认 spec reporter。

### 0.2.4（全面自检 + 真实执行验证）

- **【真 bug·smoke 抓出】** `devkit.session.copyId` 加入命令 defs 时漏加 `builtinTitlesZh` 标题映射，`apply()` 注册时抛错导致**整个插件初始化失败**——新增 `test/client-smoke.test.js`（vm 无头真实执行 client.js：stub window/document/React，驱动 factory→apply→注册表→键盘层→toast 全链路）正是为抓这类回归。修复映射后 8/8 过。
- 监听器 cleanup 失效修复：overlay 的 registry 监听按引用注销（原 filter 条件永假，StrictMode 双挂载会重复累计）。
- 探测门控命令（searchHistory/searchPanel/lazyview）标题改为静态双语映射：原在异步探测回调里用 `__t()` 冻结标题，locale 服务晚到时会永远单语。
- `registerCommand` 支持显式 `titleZh`/`titleEn`；palette 与速查表对外部命令也优先读双语字段。

### 0.2.5（sessions-face 修复）

- **切换会话双通道打开**：`sessions.open(id)` 失败/缺席时回落 `uiWorkspace.openSession(id)`（apply 时同步抓取 + deferred inject 晚绑定）。
- **「当前会话」判定修复**：不再读取恒为 undefined 的 `snap.current`，改为 `deriveCurrentSessionId(snap)` 多信号推导（`phase.current / currentSessionId / sessionId` → `projectionsBySession[*].current|isCurrent`），纯函数下沉 core.js 双源同步 + 单测覆盖五种快照形态。
- **刷新 API 探测**：`refreshSessionsList()` 优先宿主现行 `ISessions.refresh()`，回落旧名 `refreshList()`（删除会话与新建会话两条路径均接入）。

### 0.2.6（当前会话判定收敛到宿主真源）

- 按裁决文档（cross-sessions-face.md）契约收敛：SessionListState 无 current/currentSessionId 字段，「当前会话」宿主真源是 uiWorkspace（retain source:'mainView'）。
- `deriveCurrentSessionId(snap, uiWorkspaceTarget)`：第 2 参数（调用方传入已抓取 uiWorkspace 的当前 target）有值时**直接采纳**，无值走原快照软信号链（保留为 fallback）。
- 新增 `pickUiWorkspaceTargetId(uw)`：防御性读取 mainView.sessionId/target/current → currentTarget/target/sessionId；`currentSessionId()` 已接入。
