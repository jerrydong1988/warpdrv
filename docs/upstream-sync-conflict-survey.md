> ## ✅ 迁移完成，本文转为历史证据（2026-09-03）
>
> 本项目已撤销 2026-09-02 的“独立维护、不再对齐”决定，并在最新上游 v0.6.17 基础上完成独立迁移线。本文保留 220 个预测冲突路径的原始摸底数据，用于解释迁移风险和日后排查；它不再代表当前策略。
>
> **现行规则**：本 fork 长期跟随 `mikjee/warpdrv:master`，通过短周期 merge PR 吸收上游，同时保留 i18n、ModelScope、安全加固、llama.cpp 参数兼容、Windows 进程管理和 MSI 能力。操作规程与门禁见 [`docs/upstream-sync.md`](upstream-sync.md)。

# Upstream 同步冲突摸底清单（fork master `549c339` × upstream/master v0.6.17）

> 生成日期：2026-08-28 · 方法：只读 merge-tree 侦察，未改动工作树
> 数据可复现：脚本与中间产物见文末「复现步骤」
> **一句话结论：这不是 i18n 机械冲突。219 个内容冲突文件里只有 59 个是纯 i18n；fork 在冲突文件里另有 3 469 行自己的非-i18n 改动（含 MCP 命令白名单、SSRF 拦截等安全加固），其中 X+M1+M2 共 50 个文件必须真做双向合并。建议暂缓全量合并，见 §10。**

---

## 1. 结论速览

| 指标 | 数值 |
|---|---|
| merge-base | `b99b282`（fork ↔ upstream/master 的共同祖先） |
| fork 独有提交 / upstream 独有提交 | 29 / 66 |
| 全树差异文件（tip-to-tip） | 630 |
| **merge-tree 预测冲突文件** | **220**（内容冲突 212 + modify/delete 8） |
| 冲突块总数 / 冲突正文行数 | 1 452 块 / 24 424 行（不含 lock、不含标记） |
| fork 在冲突文件中的新增行 | 4 667 行，其中**非-i18n 3 469 行** |
| 纯 i18n 机械冲突文件（E1） | **59**（fork 新增行 100% 是 `t()` 提取） |
| fork 含自有非-i18n 改动的冲突文件 | **153 / 219** |
| 必须真双向合并的文件（X+M1+M2） | **50** |

**fork 独有、upstream 没有的能力（冲突之外，但决定合并策略）**：

- i18next zh-CN 层：14 命名空间 / 每份 1 392 key / `npm run i18n:check`
- MCP 命令白名单收紧（`warpmcp/src/tools/shell_exec.ts` +144 行）、`fetch` 工具 SSRF 私网拦截（+111 行）、sandbox 加固（+56 行）
- orchestrator：inference auth header 透传、URL map 有界驱逐（+105 行）
- ngram / draft-model spec-type 归一化 + Windows `taskkill /T /F` 进程树清理（processManager，fork 侧 179 行实质逻辑）
- autostart 抽成独立模块 `packages/app/src/utils/autostart.ts`

**upstream 0.6.17 独有、fork 没有的**：版本线推进到 v0.6.17；FEApplet 拆分为 26 个组件；launchserverparams（llama-server 新启动参数）；EventNode `removeChild` 修复；若干安全/依赖升级。

## 2. 前提纠正（重要）

之前把这次同步当成「i18n 提取类机械冲突」，**不成立**：

- fork 提交 `667bdb7`（2026-08-14）标题写 "merge: sync upstream master into fork (69 commits)"，其 parents 为 `5cc0726` + `b99b282`。也就是说**那次合并带进来的 upstream tip 就是今天的 merge-base**，它没有把 upstream 推进到更新的点（那 69 个提交从未进入祖先）。
- fork 在这之后继续独立演进（安全加固、spec-decode、i18n），upstream 也在同一批文件上改。因此 0.6.17 合并是**真正的双向分叉**。

## 3. 方法与口径

1. `git merge-tree --write-tree HEAD upstream/master` → 220 个冲突路径（工作树未动）。
2. 每个冲突文件取三方：`:1:` base、`:2:` ours(fork)、`:3:` theirs(upstream)。
3. **块级分析**：从 merge-tree 结果 blob 中解析 `<<<<<<< … >>>>>>>` 区间，得 `blocks`（块数）与 `blockLines`（冲突正文实际行数，不含标记）。
4. **fork 自有改动量**：`git diff -U0 base..fork -- <path>` 的新增行总数 `forkAdded`；再用正则拆成 i18n 行（`t(` / `useTranslation` / `<Trans>` / locale 路径 / `Intl.` …）与非-i18n 行；非-i18n 再分「逻辑关键字行」与「字面量/类型/注释行」。
   - ⚠️ 关键教训：**不能只按关键字判定**。`bridge/src/types/inferParamNames.ts` fork 加的是 4 行对象字面量映射（`reasoningBudgetTokens: 'reasoning_budget_tokens'`），纯关键字正则会判成「无改动」，从而错误建议「直接取 upstream」——那会静默丢代码。最终判据用 **forkAdded 全量**，i18n 之外的任何新增行都算 fork 自有改动。
5. upstream 侧同理得 `upBehavLines`（非-i18n 实质新增行数）。

### 已知局限

- `blockLines >= 200` 时不再做逐块逻辑判定，只标「大块」——M1 的 `bothLogic=0` **不代表无语义冲突**。
- 正则不识别语义等价改写：upstream 把代码搬进新组件（FEApplet 拆分）会被算作删除而非移动。
- modify/delete 与 rename 未做相似度匹配，8 个 modify/delete 全部落在 `landing/`。
- **行尾不是风险**：`core.autocrlf=true` + `.gitattributes`，但实测所有参与合并的 blob 均为 LF（0 行 CRLF）。

## 4. 分类结果

### 4.1 按建议解法（六类 + 两类特殊）

| 解法 | 文件数 | 冲突正文行 | fork 非-i18n 行 | 处理方式 |
|---|---:|---:|---:|---|
| **X-需逐块定夺** | 5 | 2 329 | 877 | 产品/架构决策后再动，见 §5 |
| **M1-手工双向合并(大块)** | 23 | 9 696 | 653 | 冲突正文 ≥200 行且 fork 有自有改动，人工双向合并 |
| **M2-手工双向合并** | 22 | 1 853 | 355 | 同区域双侧逻辑块 ≥3，人工双向合并 |
| **M4-逐块核对** | 40 | 2 352 | **1 435** | fork 自有逻辑较多但冲突块不大；**这是丢代码风险最高的一类** |
| **M3-取 upstream+回贴少量补丁** | 62 | 2 135 | 149 | fork 非-i18n 新增 ≤6 行，整段取 upstream 后回贴 |
| **E1-取 upstream+重贴 i18n** | 59 | 6 059 | 0 | fork 新增行全是 i18n 提取 → 取 upstream 再重贴 `t()` |
| D-取删除侧 | 8 | 0 | 0 | modify/delete，全在 `landing/`（已 gitignore）→ `git rm` |
| G-重新生成 | 1 | 878 | — | `package-lock.json`：取 upstream 后 `npm install` 重解析 |

> E1 是唯一可以「批量机械处理」的桶，只占 59/219。M4 一类（40 文件、1 435 行 fork 自有逻辑）是本次摸底最重要的发现：**按直觉取 upstream 会静默删掉 fork 的安全加固**。

### 4.2 按包

| 包 | 冲突文件 | 冲突正文行 | X | M1 | M2 | M4 | M3 | E1 | D/G |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| app | 153 | 20 691 | 1 | 21 | 15 | 15 | 42 | 59 | — |
| server | 26 | 2 324 | 4 | 2 | 5 | 10 | 5 | — | — |
| warpmcp | 12 | 428 | — | — | 1 | 4 | 7 | — | — |
| bridge | 9 | 558 | — | — | — | 6 | 3 | — | — |
| shared | 6 | 332 | — | — | — | 3 | 3 | — | — |
| realmcore | 4 | 57 | — | — | 1 | 1 | 2 | — | — |
| (root) | 10 | 912 | — | — | — | 1 | — | — | 8 D + 1 G |
| desktop | 0 | 0 | — | — | — | — | — | — | — |

## 5. X 类：5 个必须先做决策的文件

| 文件 | 块 | 冲突正文行 | fork 新增行(全文件) | 其中逻辑行 | upstream 非-i18n 行 | 冲突本质 | 建议 |
|---|---:|---:|---:|---:|---:|---|---|
| `server/src/services/processManager.ts` | 15 | 821 | 362 | 179 | 187 | **双侧同时重写** `buildSpecDecodeArgsPre9100/Post9100`、`buildArgs`：fork 加 ngram/draft-model spec-type 归一化与 Windows `taskkill /T /F`；upstream 引入 launchserverparams | 以 upstream 新启动参数为骨架，把 fork 的 `normalizeNgramSpecType`/`normalizeDraftModelSpecType`/`normalizeBlockDraftSpecType`/`acceptedSpecType`/`supportedFlag` 与 taskkill 逻辑重新实现一遍（不是拼接文本）；改完必须跑 llama-server 真机启动 |
| `app/src/applets/FEApplet/FEApplet.tsx` | 4 | 1 312 | 25 | 13 | 94 | upstream 把 1 413 行单体**拆成 26 个文件**（`agents/`、`guardrails/*` x12、`modes/`、`prompts/`、`todos/`、`indicators/`、`constants.ts`），fork 只在原文件做了 i18n -> 合并产出 1 300+ 行巨型块 | **取 upstream 目录结构**，然后对 26 个新文件重新做 i18n 提取（这批文件不在冲突清单里，是净新增工作量）；绝不能用 fork 版覆盖回去 |
| `server/src/services/backendValidator.ts` | 10 | 105 | 189 | 81 | 25 | base(222 行)已有该文件（**不是 fork 新建**），fork->379 行、upstream->268 行，同向演进兼容性探测 | 以 fork 实现为主，逐块把 upstream 的改动合进来；两侧都改 `validateBackendCompatibility`，需确认调用点一致 |
| `server/src/services/recipeRunner.ts` | 6 | 57 | 252 | 35 | 23 | fork->499 行 vs upstream->270 行（base 255），fork 侧改动重得多 | 以 fork 为主干，吸收 upstream 的 recipe 执行修复 |
| `server/src/util/store.ts` | 3 | 34 | 52 | 27 | 10 | fork->109 行（base 61）存储读写加固 vs upstream +1 行 | 取 fork，手工加 upstream 那 1 行 |

> 「fork 新增行(全文件)」= `git diff -U0 merge-base..HEAD -- <path>` 的新增行数（含重写/搬移），比净值更能代表要保住的工作量；「其中逻辑行」是能被关键字正则识别的部分，其余为字面量/类型/注释。

## 6. M1：23 个大块双向合并文件（全部，按冲突正文行数）

| 文件 | 块 | 冲突正文行 | fork t() | fork 非-i18n | up 非-i18n |
|---|---:|---:|---:|---:|---:|
| `app/src/pages/Servers/LaunchServer/BackendPickerCard.tsx` | 5 | 1 011 | 21 | 2 | 160 |
| `app/src/pages/Chat/assistant-ui/thread-list.tsx` | 16 | 972 | 21 | 51 | 223 |
| `app/src/pages/Chat/ChatPage.tsx` | 12 | 828 | 14 | 17 | 279 |
| `app/src/pages/Servers/LaunchServer/SpeculativeDecodingCard.tsx` | 4 | 793 | 31 | 23 | 85 |
| `app/src/pages/Settings/SettingsPage.tsx` | 45 | 776 | 95 | 98 | 143 |
| `app/src/pages/Chat/assistant-ui/ToolCallBlockWrapper.tsx` | 4 | 529 | 6 | 47 | 63 |
| `app/src/pages/Servers/WhisperServerCard.tsx` | 8 | 484 | 14 | 17 | 67 |
| `app/src/pages/Chat/assistant-ui/thread.tsx` | 13 | 423 | 1 | 32 | 269 |
| `app/src/pages/Proxy/TokenDialog.tsx` | 4 | 402 | 30 | 6 | 42 |
| `app/src/pages/Servers/Checkpoints/LoadCheckpointDialog.tsx` | 8 | 289 | 19 | 1 | 42 |
| `app/src/pages/Chat/assistant-ui/ToolCallBlockCollapsible.tsx` | 2 | 288 | 0 | 5 | 60 |
| `app/src/pages/Chat/assistant-ui/attachment.tsx` | 3 | 274 | 10 | 1 | 48 |
| `server/src/services/downloadManager.ts` | 4 | 271 | 0 | **130** | 46 |
| `server/src/index.ts` | 6 | 258 | 0 | **61** | 153 |
| `app/src/pages/Chat/ChatConfigSidebar.tsx` | 11 | 256 | 33 | 61 | 59 |
| `app/src/pages/Backends/BackendDialog.tsx` | 7 | 256 | 14 | 4 | 29 |
| `app/src/pages/Proxy/ProxyPage.tsx` | 15 | 253 | 30 | 5 | 57 |
| `app/src/pages/Servers/LaunchServer/OptionsCard.tsx` | 1 | 246 | 19 | 30 | 27 |
| `app/src/pages/Chat/assistant-ui/VoiceInput.tsx` | 5 | 237 | 3 | 2 | 111 |
| `app/src/hooks/useChatSelectors.ts` | 4 | 216 | 0 | **57** | 79 |
| `app/src/pages/Recipes/RecipesPage.tsx` | 6 | 214 | 17 | 1 | 42 |
| `app/src/pages/Servers/LaunchServer/Footer.tsx` | 1 | 212 | 10 | 1 | 42 |
| `app/src/pages/Checkpoints/CheckpointsPage.tsx` | 13 | 208 | 28 | 1 | 52 |

> M1 里 fork 自有逻辑最重的三个：`downloadManager.ts`(130)、`server/src/index.ts`(61)、`useChatSelectors.ts`(57) —— 这三个不是「贴中文」问题，是真双向合并。

## 7. M2：22 个双侧逻辑同区域文件（按双侧逻辑块数）

| 文件 | 双侧逻辑块 | fork 非-i18n | up 非-i18n | 备注 |
|---|---:|---:|---:|---|
| `server/src/services/postActions.ts` | 10 | 69 | 47 | 同区域双侧改，postAction 链两边都动过 |
| `app/src/pages/Servers/LaunchServer/LaunchServerDialog.tsx` | 7 | 2 | 88 | upstream 主导，取 upstream 后回贴 fork 少量行 |
| `server/src/services/modelProxy.ts` | 5 | 47 | 68 | 双侧都改代理转发路径，需逐块 |
| `app/src/hooks/useChatEventsStream.ts` | 4 | 41 | 83 | 事件流两侧都改 |
| `warpmcp/src/tools/file_patch.ts` | 4 | 19 | 27 | fork 侧含补丁应用加固 |
| `app/src/pages/Onboarding/steps/StepBackends.tsx` | 4 | 3 | 28 | upstream 主导 |
| `app/src/pages/Chat/ChatToolsSidebar.tsx` | 4 | 3 | 42 | upstream 主导 |
| `app/src/pages/Chat/assistant-ui/PendingToolCallsBox.tsx` | 4 | 11 | 56 | — |
| `server/src/applets/BEApplet/BEApplet.ts` | 4 | 21 | **230** | upstream 侧改动极重，以 upstream 为基线回贴 fork 的 21 行 |
| `realmcore/src/events/EventNode.ts` | 3 | 21 | 46 | fork 有空安全加固（`?.`、`existing[0]` 守卫、`throw new Error("route missing child")`）；upstream 含 `b2b527b` "fix eventnode removechild"，**语义重叠**，合并后必须重跑 225 个 realmcore 测试 |

其余 12 个 M2 文件见附录。注：`statsPoller.ts` **不在冲突清单内**（三方未撞车）；fork 在 `processManager.ts` 里从它 import `startStatsPolling/stopStatsPolling`，该接线点需在 §5 的 processManager 合并时一并确认。

## 8. M4：40 个「fork 自有逻辑最多」的文件（丢代码风险最高）

这些文件冲突块不算大，容易被顺手 `--theirs` 掉，但 fork 在每个里面都有真实改动：

| 文件 | fork 非-i18n 行 | fork 做了什么（抽样确认） |
|---|---:|---|
| `warpmcp/src/tools/shell_exec.ts` | 144 | **命令白名单收紧**：显式排除 bash/sh/zsh/fish/powershell/cmd（否则 `-c` 让白名单失效），只读系统探测命令单独分组，pipeline/redirect/subshell/分隔符继续拦 |
| `warpmcp/src/tools/fetch.ts` | 111 | **SSRF 防护**：`isPrivateAddress()`（含 IPv6 loopback、`::ffff:` IPv4-mapped）、10 MB 响应上限、5 次重定向上限、15 s 超时 |
| `bridge/src/orchestrator/index.ts` | 105 | inference auth header 透传；`threadInferenceUrls` 加 200 条上界驱逐（原来无界增长） |
| `server/src/services/initRealm.ts` | 93 | realm 初始化路径加固 |
| `app/package.json` / `bridge/package.json` / `package.json` | 85/48/22 | 依赖与脚本（含 i18next 系列），需三方手工合，**不能取任一侧** |
| `server/src/routes/settings.ts` | 78 | 设置读写 + autostart 相关端点 |
| `shared/src/flagMappings.ts` | 78 | flag → CLI 参数映射（与 spec-decode 归一化配套） |
| `warpmcp/src/util/sandbox.ts` | 56 | 沙箱边界加固 |
| `app/src/components/ResizeHandles.tsx` | 46 | fork 独有交互组件 |
| `bridge/src/types/index.ts` / `shared/src/types.ts` / `shared/src/enums.ts` | 41/39/31 | 类型面：与上面实现配套，**必须同批合并否则编译不过** |

其余 29 个文件（≤35 行）见附录。

## 9. 静默行为变化清单（合并后不会报错但会变的东西）

1. **autostart**：upstream 把逻辑内联在 `app/src/pages/Settings/SettingsPage.tsx` + `server/src/index.ts`；fork 抽到 `packages/app/src/utils/autostart.ts`，且被 `packages/app/tests/runtimeState.test.ts` 引用。若按 upstream 取 SettingsPage 又删掉模块 → 测试红；若保留 fork 模块又接受 upstream 内联版 → **两份 autostart 实现**。
2. **FEApplet 拆分**：fork 的 i18n key 挂在旧单体文件的调用点上，取 upstream 结构后这些 `t()` 全部消失但 key 仍在 locale 里 —— `i18n:check` 只校验 key 对齐，**不会报未提取**。建议合并后加一轮硬编码字面量扫描。
3. **spec-decode / launchserverparams**：两侧都改同一批 args 构造函数，文本合上但参数重复/互斥只有真机启动 llama-server 才暴露。
4. **EventNode**：fork 空安全加固与 upstream `removeChild` 修复意图重叠，合并易出现「双守卫」或守卫被覆盖。
5. **package.json 三方**：`version`、`scripts`、依赖三处都要手工定，取任一侧都会丢东西。
6. **upstream `augfix24`(`7d7fd23`) 的 autostart-toast 修复未进 master**，与本项意图重叠 —— 若日后 cherry-pick 会与本次合并结果再次冲突。

## 10. 三条路线成本对比与建议

| 路线 | 内容 | 估算 | 风险 |
|---|---|---:|---|
| **A. 全量合并 0.6.17** | 219 文件逐类处理 + 5 批验证 | **≈ 180 人时（23–26 人日）** | 高：M4/X 共 45 文件承载 fork 安全加固与 spec-decode，回归面覆盖进程管理、MCP 沙箱、SSRF、realm 初始化 |
| **B. 暂缓合并，按需 cherry-pick**（推荐） | 留在 v0.5.8；只挑 upstream 明确的修复提交（EventNode removeChild、依赖安全升级等）逐个 cherry-pick + 跑测试 | **≈ ≤ 10 人时** | 低：每次改动可验证，不引入 FEApplet 拆分这类结构性重写 |
| C. 全量取 upstream + 重做 i18n | `--theirs` 后重新提取中文 | ≈ 200+ 人时 | **不建议**：会丢 fork 的 3 469 行非-i18n 改动（安全加固、spec-decode、进程树清理），且需重做全部 i18n |

**建议路线 B**，理由：本次摸底推翻了「fork ≈ upstream + i18n」的假设。fork 在 MCP 工具面（白名单、SSRF、沙箱）与推理启动面（spec-type 归一化、Windows 进程树清理）都有 upstream 不具备的实现；全量合并的实际成本是「重做 fork 的一半能力」，而不是「贴中文」。

若仍要走 A，按此顺序分 5 批，每批结束跑全套验证：

| 批次 | 范围 | 文件数 | 要点 |
|---|---|---:|---|
| 1 | D + G（`landing/` 删除、lock 重解析） | 9 | 先清噪音，让后续 `git status` 可读 |
| 2 | E1 纯 i18n | 59 | 取 upstream → 重贴 `t()` → `i18n:check` |
| 3 | M3（≤6 行回贴）+ M4（逐块核对） | 102 | **M4 必须逐块看 diff，禁止整文件 `--theirs`** |
| 4 | M1 + M2 | 45 | 大块人工合并；类型面（`shared/types.ts`、`bridge/types/index.ts`）与实现同批 |
| 5 | X | 5 | 需先决策 FEApplet 拆分与 spec-decode 参数面 |

每批验证基线（HEAD `549c339` 全绿，合并后必须保持）：

```bash
npm run i18n:check -w @warpcore/app   # 1 392 key / 14 namespace
npm run lint
npm test                              # 291 passing：realmcore 225 · server 49 · warpmcp 11 · app 6
```

## 11. 附录：220 文件全量表

| 文件 | 块 | 冲突正文行 | fork 新增 | 其中非-i18n | fork t() | up 非-i18n 行 | 建议解法 | 依据 |
|---|---:|---:|---:|---:|---:|---:|---|---|

> 列口径：「块 / 冲突正文行」来自 merge-tree 结果 blob 的 `<<<<<<<` 区间；「fork 新增 / 其中非-i18n / fork t()」为 `git diff -U0 merge-base..HEAD -- <path>` 的**全文件**新增行数（含重写与搬移），故可能大于冲突正文行；「up 非-i18n 行」同理取自 upstream 侧。
| `landing/.astro/content.d.ts` | 0 | 0 | 0 | 0 | 0 | 20 | D-取删除侧 | modify/delete（upstream 改动、fork 已删）→ 取删除侧 |
| `landing/.astro/data-store.json` | 0 | 0 | 0 | 0 | 0 | 43 | D-取删除侧 | modify/delete（upstream 改动、fork 已删）→ 取删除侧 |
| `landing/.astro/types.d.ts` | 0 | 0 | 0 | 0 | 0 | 0 | D-取删除侧 | modify/delete（upstream 改动、fork 已删）→ 取删除侧 |
| `landing/original/chat.html` | 0 | 0 | 0 | 0 | 0 | 1 | D-取删除侧 | modify/delete（upstream 改动、fork 已删）→ 取删除侧 |
| `landing/.astro/content-assets.mjs` | 0 | 0 | 0 | 0 | 0 | 1 | D-取删除侧 | modify/delete（upstream 改动、fork 已删）→ 取删除侧 |
| `landing/.astro/settings.json` | 0 | 0 | 0 | 0 | 0 | 0 | D-取删除侧 | modify/delete（upstream 改动、fork 已删）→ 取删除侧 |
| `landing/.astro/collections/docs.schema.json` | 0 | 0 | 0 | 0 | 0 | 1 | D-取删除侧 | modify/delete（upstream 改动、fork 已删）→ 取删除侧 |
| `landing/.astro/dev.json` | 0 | 0 | 0 | 0 | 0 | 0 | D-取删除侧 | modify/delete（upstream 改动、fork 已删）→ 取删除侧 |
| `app/src/pages/Servers/LaunchWhisper/WhisperLaunchDialog.tsx` | 10 | 555 | 40 | 0 | 36 | 95 | E1-取upstream+重贴i18n | fork 新增 40 行全部是 i18n 提取（t=36） |
| `app/src/pages/Servers/ServerCard.tsx` | 6 | 443 | 26 | 0 | 24 | 99 | E1-取upstream+重贴i18n | fork 新增 26 行全部是 i18n 提取（t=24） |
| `app/src/pages/Backends/ActivateBackendDialog.tsx` | 9 | 427 | 21 | 0 | 19 | 43 | E1-取upstream+重贴i18n | fork 新增 21 行全部是 i18n 提取（t=19） |
| `app/src/pages/Backends/BackendsPage.tsx` | 3 | 362 | 29 | 0 | 27 | 76 | E1-取upstream+重贴i18n | fork 新增 29 行全部是 i18n 提取（t=27） |
| `app/src/pages/Hub/HubModelDetail.tsx` | 7 | 307 | 20 | 0 | 17 | 67 | E1-取upstream+重贴i18n | fork 新增 20 行全部是 i18n 提取（t=17） |
| `app/src/pages/Servers/LaunchServer/ModelPicker.tsx` | 3 | 289 | 9 | 0 | 6 | 35 | E1-取upstream+重贴i18n | fork 新增 9 行全部是 i18n 提取（t=6） |
| `app/src/pages/Servers/Checkpoints/SaveCheckpointDialog.tsx` | 4 | 280 | 24 | 0 | 22 | 49 | E1-取upstream+重贴i18n | fork 新增 24 行全部是 i18n 提取（t=22） |
| `app/src/pages/Backends/WhisperBackendDialog.tsx` | 7 | 252 | 20 | 0 | 18 | 22 | E1-取upstream+重贴i18n | fork 新增 20 行全部是 i18n 提取（t=18） |
| `app/src/pages/Backends/BackendGroupDialog.tsx` | 8 | 220 | 17 | 0 | 15 | 39 | E1-取upstream+重贴i18n | fork 新增 17 行全部是 i18n 提取（t=15） |
| `app/src/pages/Servers/LaunchServer/RecommendedParamsCard.tsx` | 2 | 193 | 7 | 0 | 5 | 32 | E1-取upstream+重贴i18n | fork 新增 7 行全部是 i18n 提取（t=5） |
| `app/src/pages/Servers/LaunchServer/ContextKVCard.tsx` | 1 | 183 | 9 | 0 | 7 | 20 | E1-取upstream+重贴i18n | fork 新增 9 行全部是 i18n 提取（t=7） |
| `app/src/pages/Servers/LaunchServer/ServerInfoCard.tsx` | 1 | 176 | 7 | 0 | 5 | 13 | E1-取upstream+重贴i18n | fork 新增 7 行全部是 i18n 提取（t=5） |
| `app/src/pages/Recipes/RecipeEditorDialog.tsx` | 8 | 174 | 13 | 0 | 11 | 14 | E1-取upstream+重贴i18n | fork 新增 13 行全部是 i18n 提取（t=11） |
| `app/src/pages/Chat/assistant-ui/slash-command/SlashCmdToolSelector.tsx` | 3 | 157 | 4 | 0 | 2 | 107 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Hub/DirPickerPopover.tsx` | 3 | 124 | 4 | 0 | 2 | 7 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/components/ServerPicker.tsx` | 3 | 123 | 4 | 0 | 2 | 55 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Servers/LaunchServer/MultiModalCard.tsx` | 1 | 119 | 5 | 0 | 3 | 15 | E1-取upstream+重贴i18n | fork 新增 5 行全部是 i18n 提取（t=3） |
| `app/src/pages/Servers/LaunchServer/EmbeddingCard.tsx` | 1 | 112 | 5 | 0 | 3 | 16 | E1-取upstream+重贴i18n | fork 新增 5 行全部是 i18n 提取（t=3） |
| `app/src/pages/Servers/ServersPage.tsx` | 5 | 108 | 16 | 0 | 14 | 75 | E1-取upstream+重贴i18n | fork 新增 16 行全部是 i18n 提取（t=14） |
| `app/src/pages/Chat/ChatSearchDialog.tsx` | 7 | 104 | 9 | 0 | 7 | 42 | E1-取upstream+重贴i18n | fork 新增 9 行全部是 i18n 提取（t=7） |
| `app/src/pages/Chat/WorkspaceView.tsx` | 8 | 103 | 11 | 0 | 8 | 78 | E1-取upstream+重贴i18n | fork 新增 11 行全部是 i18n 提取（t=8） |
| `app/src/pages/Proxy/AccessTokensSection.tsx` | 4 | 103 | 24 | 0 | 20 | 23 | E1-取upstream+重贴i18n | fork 新增 24 行全部是 i18n 提取（t=20） |
| `app/src/components/ui/dialog.tsx` | 3 | 98 | 5 | 0 | 2 | 22 | E1-取upstream+重贴i18n | fork 新增 5 行全部是 i18n 提取（t=2） |
| `app/src/pages/Backends/BackendRow.tsx` | 3 | 96 | 6 | 0 | 4 | 21 | E1-取upstream+重贴i18n | fork 新增 6 行全部是 i18n 提取（t=4） |
| `app/src/pages/Servers/WhisperServerLogs.tsx` | 3 | 89 | 4 | 0 | 2 | 19 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Chat/assistant-ui/EmbeddingToggle.tsx` | 5 | 60 | 7 | 0 | 5 | 28 | E1-取upstream+重贴i18n | fork 新增 7 行全部是 i18n 提取（t=5） |
| `app/src/applets/ui/UiSpaceWrapper.tsx` | 1 | 56 | 3 | 0 | 1 | 11 | E1-取upstream+重贴i18n | fork 新增 3 行全部是 i18n 提取（t=1） |
| `app/src/pages/Backends/DeviceCard.tsx` | 3 | 53 | 4 | 0 | 2 | 7 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Backends/BackendGroupCard.tsx` | 5 | 50 | 5 | 0 | 3 | 13 | E1-取upstream+重贴i18n | fork 新增 5 行全部是 i18n 提取（t=3） |
| `app/src/pages/Chat/ChatSidebar.tsx` | 1 | 43 | 1 | 0 | 0 | 97 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `app/src/pages/Onboarding/steps/StepDone.tsx` | 3 | 43 | 6 | 0 | 4 | 5 | E1-取upstream+重贴i18n | fork 新增 6 行全部是 i18n 提取（t=4） |
| `app/src/pages/MCP/AddServerForm.tsx` | 2 | 41 | 8 | 0 | 6 | 12 | E1-取upstream+重贴i18n | fork 新增 8 行全部是 i18n 提取（t=6） |
| `app/src/pages/Chat/assistant-ui/SelectionPopover.tsx` | 4 | 40 | 6 | 0 | 4 | 49 | E1-取upstream+重贴i18n | fork 新增 6 行全部是 i18n 提取（t=4） |
| `app/src/pages/Onboarding/steps/StepWelcome.tsx` | 2 | 33 | 5 | 0 | 3 | 4 | E1-取upstream+重贴i18n | fork 新增 5 行全部是 i18n 提取（t=3） |
| `app/src/pages/Chat/assistant-ui/tool-fallback.tsx` | 1 | 33 | 3 | 0 | 1 | 32 | E1-取upstream+重贴i18n | fork 新增 3 行全部是 i18n 提取（t=1） |
| `app/src/pages/Chat/assistant-ui/WhisperServerSelector.tsx` | 3 | 28 | 4 | 0 | 2 | 22 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Chat/assistant-ui/ServerSelector.tsx` | 3 | 28 | 4 | 0 | 2 | 37 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Home/Tiles/KokoroTile.tsx` | 2 | 28 | 4 | 0 | 2 | 7 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/MCP/McpPage.tsx` | 3 | 26 | 8 | 0 | 6 | 16 | E1-取upstream+重贴i18n | fork 新增 8 行全部是 i18n 提取（t=6） |
| `app/src/pages/Login/LoginPage.tsx` | 3 | 26 | 8 | 0 | 6 | 8 | E1-取upstream+重贴i18n | fork 新增 8 行全部是 i18n 提取（t=6） |
| `app/src/pages/Recipes/InputFormGenerator.tsx` | 2 | 25 | 3 | 0 | 1 | 8 | E1-取upstream+重贴i18n | fork 新增 3 行全部是 i18n 提取（t=1） |
| `app/src/pages/MCP/JsonEditorView.tsx` | 2 | 24 | 5 | 0 | 3 | 7 | E1-取upstream+重贴i18n | fork 新增 5 行全部是 i18n 提取（t=3） |
| `app/src/pages/Home/Tiles/AppServerTile.tsx` | 2 | 21 | 4 | 0 | 2 | 7 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Home/Tiles/ProxyTile.tsx` | 2 | 20 | 4 | 0 | 2 | 8 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Home/Tiles/ModelsTile.tsx` | 2 | 19 | 4 | 0 | 2 | 7 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Home/Tiles/BackendsTile.tsx` | 2 | 19 | 4 | 0 | 2 | 7 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/components/UpdateBanner.tsx` | 2 | 18 | 4 | 0 | 2 | 5 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Chat/assistant-ui/KokoroTTS.tsx` | 1 | 18 | 1 | 0 | 0 | 28 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `app/src/pages/Servers/ServerLogs.tsx` | 2 | 17 | 4 | 0 | 2 | 7 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/Home/Tiles/McpTile.tsx` | 1 | 16 | 4 | 0 | 2 | 11 | E1-取upstream+重贴i18n | fork 新增 4 行全部是 i18n 提取（t=2） |
| `app/src/pages/MCP/MCPServerCard.tsx` | 1 | 15 | 6 | 0 | 4 | 8 | E1-取upstream+重贴i18n | fork 新增 6 行全部是 i18n 提取（t=4） |
| `app/src/pages/Home/Tiles/DownloadsTile.tsx` | 1 | 14 | 3 | 0 | 1 | 9 | E1-取upstream+重贴i18n | fork 新增 3 行全部是 i18n 提取（t=1） |
| `app/src/pages/Servers/LaunchServer/Helpers.tsx` | 1 | 10 | 1 | 0 | 0 | 28 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `app/src/pages/Servers/SlotPill.tsx` | 1 | 10 | 1 | 0 | 0 | 7 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `app/src/pages/Home/TileContainer.tsx` | 1 | 8 | 1 | 0 | 0 | 8 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `app/src/pages/MCP/McpStatusDot.tsx` | 1 | 6 | 1 | 0 | 0 | 2 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `app/src/pages/Home/TileValueDisplay.tsx` | 1 | 6 | 1 | 0 | 0 | 4 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `app/src/pages/Chat/assistant-ui/ComposerEditor.tsx` | 1 | 4 | 1 | 0 | 0 | 25 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `app/src/pages/Onboarding/components/OnboardingHeader.tsx` | 1 | 4 | 1 | 0 | 0 | 1 | E1-取upstream+重贴i18n | fork 新增 1 行全部是 i18n 提取（t=0） |
| `package-lock.json` | 67 | 878 | — | — | 0 | 36 | G-重新生成 | 锁文件：取 upstream 后 npm install 重解析（fork 只加了 i18next 系列依赖） |
| `app/src/pages/Servers/LaunchServer/BackendPickerCard.tsx` | 5 | 1011 | 27 | 2 | 21 | 160 | M1-手工双向合并(大块) | 冲突正文 1011 行；fork 非-i18n 新增 2 行（逻辑 2 / 字面量类型注释 0），upstream 非-i18n 160 行 |
| `app/src/pages/Chat/assistant-ui/thread-list.tsx` | 16 | 972 | 77 | 51 | 21 | 223 | M1-手工双向合并(大块) | 冲突正文 972 行；fork 非-i18n 新增 51 行（逻辑 9 / 字面量类型注释 42），upstream 非-i18n 223 行 |
| `app/src/pages/Chat/ChatPage.tsx` | 12 | 828 | 33 | 17 | 14 | 279 | M1-手工双向合并(大块) | 冲突正文 828 行；fork 非-i18n 新增 17 行（逻辑 5 / 字面量类型注释 12），upstream 非-i18n 279 行 |
| `app/src/pages/Servers/LaunchServer/SpeculativeDecodingCard.tsx` | 4 | 793 | 57 | 23 | 31 | 85 | M1-手工双向合并(大块) | 冲突正文 793 行；fork 非-i18n 新增 23 行（逻辑 7 / 字面量类型注释 16），upstream 非-i18n 85 行 |
| `app/src/pages/Settings/SettingsPage.tsx` | 45 | 776 | 195 | 98 | 95 | 143 | M1-手工双向合并(大块) | 冲突正文 776 行；fork 非-i18n 新增 98 行（逻辑 21 / 字面量类型注释 77），upstream 非-i18n 143 行 |
| `app/src/pages/Chat/assistant-ui/ToolCallBlockWrapper.tsx` | 4 | 529 | 56 | 47 | 6 | 63 | M1-手工双向合并(大块) | 冲突正文 529 行；fork 非-i18n 新增 47 行（逻辑 12 / 字面量类型注释 35），upstream 非-i18n 63 行 |
| `app/src/pages/Servers/WhisperServerCard.tsx` | 8 | 484 | 33 | 17 | 14 | 67 | M1-手工双向合并(大块) | 冲突正文 484 行；fork 非-i18n 新增 17 行（逻辑 10 / 字面量类型注释 7），upstream 非-i18n 67 行 |
| `app/src/pages/Chat/assistant-ui/thread.tsx` | 13 | 423 | 35 | 32 | 1 | 269 | M1-手工双向合并(大块) | 冲突正文 423 行；fork 非-i18n 新增 32 行（逻辑 18 / 字面量类型注释 14），upstream 非-i18n 269 行 |
| `app/src/pages/Proxy/TokenDialog.tsx` | 4 | 402 | 40 | 6 | 30 | 42 | M1-手工双向合并(大块) | 冲突正文 402 行；fork 非-i18n 新增 6 行（逻辑 0 / 字面量类型注释 6），upstream 非-i18n 42 行 |
| `app/src/pages/Servers/Checkpoints/LoadCheckpointDialog.tsx` | 8 | 289 | 24 | 1 | 19 | 42 | M1-手工双向合并(大块) | 冲突正文 289 行；fork 非-i18n 新增 1 行（逻辑 1 / 字面量类型注释 0），upstream 非-i18n 42 行 |
| `app/src/pages/Chat/assistant-ui/ToolCallBlockCollapsible.tsx` | 2 | 288 | 5 | 5 | 0 | 60 | M1-手工双向合并(大块) | 冲突正文 288 行；fork 非-i18n 新增 5 行（逻辑 5 / 字面量类型注释 0），upstream 非-i18n 60 行 |
| `app/src/pages/Chat/assistant-ui/attachment.tsx` | 3 | 274 | 18 | 1 | 10 | 48 | M1-手工双向合并(大块) | 冲突正文 274 行；fork 非-i18n 新增 1 行（逻辑 1 / 字面量类型注释 0），upstream 非-i18n 48 行 |
| `server/src/services/downloadManager.ts` | 4 | 271 | 130 | 130 | 0 | 46 | M1-手工双向合并(大块) | 冲突正文 271 行；fork 非-i18n 新增 130 行（逻辑 42 / 字面量类型注释 88），upstream 非-i18n 46 行 |
| `server/src/index.ts` | 6 | 258 | 61 | 61 | 0 | 153 | M1-手工双向合并(大块) | 冲突正文 258 行；fork 非-i18n 新增 61 行（逻辑 19 / 字面量类型注释 42），upstream 非-i18n 153 行 |
| `app/src/pages/Chat/ChatConfigSidebar.tsx` | 11 | 256 | 96 | 61 | 33 | 59 | M1-手工双向合并(大块) | 冲突正文 256 行；fork 非-i18n 新增 61 行（逻辑 9 / 字面量类型注释 52），upstream 非-i18n 59 行 |
| `app/src/pages/Backends/BackendDialog.tsx` | 7 | 256 | 20 | 4 | 14 | 29 | M1-手工双向合并(大块) | 冲突正文 256 行；fork 非-i18n 新增 4 行（逻辑 1 / 字面量类型注释 3），upstream 非-i18n 29 行 |
| `app/src/pages/Proxy/ProxyPage.tsx` | 15 | 253 | 38 | 5 | 30 | 57 | M1-手工双向合并(大块) | 冲突正文 253 行；fork 非-i18n 新增 5 行（逻辑 0 / 字面量类型注释 5），upstream 非-i18n 57 行 |
| `app/src/pages/Servers/LaunchServer/OptionsCard.tsx` | 1 | 246 | 51 | 30 | 19 | 27 | M1-手工双向合并(大块) | 冲突正文 246 行；fork 非-i18n 新增 30 行（逻辑 8 / 字面量类型注释 22），upstream 非-i18n 27 行 |
| `app/src/pages/Chat/assistant-ui/VoiceInput.tsx` | 5 | 237 | 7 | 2 | 3 | 111 | M1-手工双向合并(大块) | 冲突正文 237 行；fork 非-i18n 新增 2 行（逻辑 1 / 字面量类型注释 1），upstream 非-i18n 111 行 |
| `app/src/hooks/useChatSelectors.ts` | 4 | 216 | 57 | 57 | 0 | 79 | M1-手工双向合并(大块) | 冲突正文 216 行；fork 非-i18n 新增 57 行（逻辑 9 / 字面量类型注释 48），upstream 非-i18n 79 行 |
| `app/src/pages/Recipes/RecipesPage.tsx` | 6 | 214 | 21 | 1 | 17 | 42 | M1-手工双向合并(大块) | 冲突正文 214 行；fork 非-i18n 新增 1 行（逻辑 1 / 字面量类型注释 0），upstream 非-i18n 42 行 |
| `app/src/pages/Servers/LaunchServer/Footer.tsx` | 1 | 212 | 13 | 1 | 10 | 42 | M1-手工双向合并(大块) | 冲突正文 212 行；fork 非-i18n 新增 1 行（逻辑 0 / 字面量类型注释 1），upstream 非-i18n 42 行 |
| `app/src/pages/Checkpoints/CheckpointsPage.tsx` | 13 | 208 | 31 | 1 | 28 | 52 | M1-手工双向合并(大块) | 冲突正文 208 行；fork 非-i18n 新增 1 行（逻辑 1 / 字面量类型注释 0），upstream 非-i18n 52 行 |
| `app/src/hooks/useChatEventsStream.ts` | 5 | 162 | 41 | 41 | 0 | 83 | M2-手工双向合并 | 同区域双侧逻辑块 4 个；fork 非-i18n 新增 41 行，upstream 83 行 |
| `app/src/pages/Hub/HubPage.tsx` | 9 | 161 | 22 | 4 | 16 | 44 | M2-手工双向合并 | 同区域双侧逻辑块 4 个；fork 非-i18n 新增 4 行，upstream 44 行 |
| `app/src/pages/Chat/assistant-ui/PendingToolCallsBox.tsx` | 6 | 151 | 11 | 11 | 0 | 56 | M2-手工双向合并 | 同区域双侧逻辑块 4 个；fork 非-i18n 新增 11 行，upstream 56 行 |
| `server/src/services/postActions.ts` | 10 | 129 | 69 | 69 | 0 | 47 | M2-手工双向合并 | 同区域双侧逻辑块 10 个；fork 非-i18n 新增 69 行，upstream 47 行 |
| `app/src/pages/Recipes/RunRecipeDialog.tsx` | 8 | 128 | 34 | 21 | 11 | 23 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 21 行，upstream 23 行 |
| `server/src/applets/BEApplet/BEApplet.ts` | 4 | 123 | 21 | 21 | 0 | 230 | M2-手工双向合并 | 同区域双侧逻辑块 4 个；fork 非-i18n 新增 21 行，upstream 230 行 |
| `app/src/pages/Onboarding/steps/StepBackends.tsx` | 7 | 119 | 14 | 3 | 9 | 28 | M2-手工双向合并 | 同区域双侧逻辑块 4 个；fork 非-i18n 新增 3 行，upstream 28 行 |
| `app/src/pages/Servers/LaunchServer/LaunchServerDialog.tsx` | 8 | 111 | 15 | 2 | 11 | 88 | M2-手工双向合并 | 同区域双侧逻辑块 7 个；fork 非-i18n 新增 2 行，upstream 88 行 |
| `app/src/pages/Models/ModelsPage.tsx` | 5 | 105 | 22 | 1 | 18 | 69 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 1 行，upstream 69 行 |
| `app/src/pages/Chat/assistant-ui/Elicitation.tsx` | 4 | 101 | 21 | 14 | 5 | 48 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 14 行，upstream 48 行 |
| `app/src/pages/Chat/ChatToolsSidebar.tsx` | 9 | 99 | 13 | 3 | 7 | 42 | M2-手工双向合并 | 同区域双侧逻辑块 4 个；fork 非-i18n 新增 3 行，upstream 42 行 |
| `app/src/pages/Chat/ThreadSearchPanel.tsx` | 7 | 69 | 9 | 2 | 5 | 25 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 2 行，upstream 25 行 |
| `app/src/pages/Chat/assistant-ui/ToolCallBlock.tsx` | 3 | 62 | 5 | 1 | 2 | 7 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 1 行，upstream 7 行 |
| `server/src/services/modelProxy.ts` | 5 | 62 | 47 | 47 | 0 | 68 | M2-手工双向合并 | 同区域双侧逻辑块 5 个；fork 非-i18n 新增 47 行，upstream 68 行 |
| `app/src/pages/Hub/HubModelCard.tsx` | 3 | 54 | 20 | 11 | 7 | 11 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 11 行，upstream 11 行 |
| `app/src/pages/Home/Tiles/ServersTile.tsx` | 4 | 44 | 12 | 7 | 3 | 21 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 7 行，upstream 21 行 |
| `warpmcp/src/tools/file_patch.ts` | 4 | 40 | 19 | 19 | 0 | 27 | M2-手工双向合并 | 同区域双侧逻辑块 4 个；fork 非-i18n 新增 19 行，upstream 27 行 |
| `realmcore/src/events/EventNode.ts` | 3 | 33 | 21 | 21 | 0 | 46 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 21 行，upstream 46 行 |
| `app/src/hooks/useFileReader.ts` | 3 | 31 | 7 | 7 | 0 | 18 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 7 行，upstream 18 行 |
| `app/src/api/client.ts` | 3 | 28 | 14 | 14 | 0 | 8 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 14 行，upstream 8 行 |
| `server/src/middleware/auth.ts` | 3 | 23 | 18 | 18 | 0 | 18 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 18 行，upstream 18 行 |
| `server/src/routes/backends.ts` | 3 | 18 | 18 | 18 | 0 | 33 | M2-手工双向合并 | 同区域双侧逻辑块 3 个；fork 非-i18n 新增 18 行，upstream 33 行 |
| `bridge/src/types/inferParamNames.ts` | 1 | 155 | 4 | 4 | 0 | 0 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 4 行（逻辑 0 / 字面量类型注释 4），可整段取 upstream 后回贴 |
| `app/src/store/index.ts` | 2 | 131 | 2 | 2 | 0 | 92 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 0 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/pages/About/AboutPage.tsx` | 6 | 123 | 12 | 1 | 9 | 8 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/pages/Home/Steps/CreateServerStep.tsx` | 1 | 104 | 16 | 6 | 1 | 8 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 6 行（逻辑 2 / 字面量类型注释 4），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/DictationContext.tsx` | 2 | 93 | 3 | 2 | 0 | 80 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 2 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/RgRenderer.tsx` | 1 | 89 | 3 | 3 | 0 | 33 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 1 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/pages/Home/HomePage.tsx` | 4 | 87 | 8 | 2 | 4 | 21 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 0 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/ui-space/ComposerUiSpace.tsx` | 1 | 72 | 1 | 1 | 0 | 15 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `shared/src/index.ts` | 1 | 62 | 1 | 1 | 0 | 21 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/MCP/ToolListSidebar.tsx` | 5 | 61 | 11 | 2 | 6 | 19 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 1 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/ReadFileRenderer.tsx` | 1 | 59 | 3 | 3 | 0 | 42 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 1 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/pages/Home/StepCollapsible.tsx` | 2 | 58 | 2 | 1 | 0 | 8 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/components/dialogs/ConfirmDialog.tsx` | 3 | 58 | 6 | 2 | 2 | 6 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 2 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/CodeGraphListRenderer.tsx` | 1 | 58 | 3 | 3 | 0 | 25 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 1 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/TodoRenderer.tsx` | 1 | 57 | 1 | 1 | 0 | 91 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/components/PageHeader.tsx` | 1 | 54 | 1 | 1 | 0 | 15 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/applets/ui/GuardrailBadge.tsx` | 2 | 51 | 2 | 2 | 0 | 97 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 1 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/ListRenderer.tsx` | 2 | 51 | 6 | 6 | 0 | 43 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 6 行（逻辑 2 / 字面量类型注释 4），可整段取 upstream 后回贴 |
| `server/src/routes/chat.ts` | 2 | 50 | 6 | 6 | 0 | 135 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 6 行（逻辑 1 / 字面量类型注释 5），可整段取 upstream 后回贴 |
| `app/src/api/guardrail-services.ts` | 1 | 49 | 4 | 4 | 0 | 9 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 4 行（逻辑 4 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Onboarding/steps/StepGuide.tsx` | 2 | 42 | 13 | 3 | 8 | 7 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 1 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/pages/Onboarding/steps/StepModelFolders.tsx` | 4 | 40 | 8 | 2 | 4 | 17 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 0 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/markdown-text.tsx` | 1 | 39 | 4 | 1 | 1 | 43 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/pages/Home/StatusDot.tsx` | 2 | 37 | 2 | 1 | 0 | 5 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/DiffRenderer.tsx` | 1 | 36 | 3 | 3 | 0 | 39 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 1 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `warpmcp/src/index.ts` | 1 | 33 | 2 | 2 | 0 | 59 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 1 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/hooks/useWorkspace.ts` | 1 | 27 | 1 | 1 | 0 | 22 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `warpmcp/src/tools/file_write.ts` | 2 | 21 | 4 | 4 | 0 | 8 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 4 行（逻辑 2 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/components/Card.tsx` | 2 | 21 | 3 | 3 | 0 | 7 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 1 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `shared/package.json` | 1 | 19 | 6 | 6 | 0 | 0 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 6 行（逻辑 0 / 字面量类型注释 6），可整段取 upstream 后回贴 |
| `app/src/pages/Onboarding/OnboardingPage.tsx` | 1 | 19 | 4 | 2 | 0 | 10 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 1 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `warpmcp/src/tools/file_read.ts` | 2 | 19 | 4 | 4 | 0 | 10 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 4 行（逻辑 2 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/components/KeyCapture.tsx` | 3 | 16 | 7 | 2 | 3 | 6 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 1 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `warpmcp/src/tools/dir_list.ts` | 1 | 15 | 2 | 2 | 0 | 19 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 1 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/applets/ui/ModeBadge.tsx` | 1 | 15 | 1 | 1 | 0 | 55 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/CodeGraphClearRenderer.tsx` | 2 | 15 | 5 | 2 | 1 | 5 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 1 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/store/types.ts` | 1 | 14 | 1 | 1 | 0 | 31 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/applets/lib/types.ts` | 1 | 14 | 1 | 1 | 0 | 7 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `server/src/routes/auth.ts` | 3 | 14 | 6 | 6 | 0 | 15 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 6 行（逻辑 0 / 字面量类型注释 6），可整段取 upstream 后回贴 |
| `bridge/src/persistence/embeddingStore.ts` | 1 | 13 | 2 | 2 | 0 | 11 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 0 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `app/src/applets/ui/ModeTabs.tsx` | 1 | 13 | 1 | 1 | 0 | 20 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/TTSFlameWaveform.tsx` | 2 | 12 | 6 | 5 | 0 | 3 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 5 行（逻辑 2 / 字面量类型注释 3），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/BashRenderer.tsx` | 1 | 11 | 4 | 4 | 0 | 26 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 4 行（逻辑 2 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `server/src/routes/mcp.ts` | 1 | 11 | 2 | 2 | 0 | 28 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 0 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `realmcore/src/applet/index.ts` | 1 | 9 | 1 | 1 | 0 | 4 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Onboarding/components/ImageCarousel.tsx` | 2 | 9 | 4 | 1 | 1 | 6 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/ui-space/UiSpacePanel.tsx` | 1 | 8 | 1 | 1 | 0 | 13 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `warpmcp/src/types.ts` | 1 | 8 | 1 | 1 | 0 | 20 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 0 / 字面量类型注释 1），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/tool-renderers/resolver.ts` | 1 | 6 | 3 | 3 | 0 | 5 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 3 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Onboarding/components/OnboardingFooter.tsx` | 1 | 6 | 3 | 2 | 0 | 2 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 0 / 字面量类型注释 2），可整段取 upstream 后回贴 |
| `realmcore/src/utils/SegmentTrie.ts` | 1 | 5 | 2 | 2 | 0 | 25 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 2 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `server/src/applets/lib/types.ts` | 1 | 5 | 1 | 1 | 0 | 2 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `bridge/src/permissions/index.ts` | 1 | 5 | 3 | 3 | 0 | 14 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 3 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `warpmcp/src/tools/embedding_search.ts` | 1 | 5 | 2 | 2 | 0 | 5 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 2 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/VADManager.ts` | 1 | 5 | 1 | 1 | 0 | 4 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `shared/src/checkpoint-types.ts` | 1 | 5 | 1 | 1 | 0 | 3 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/api/mode-services.ts` | 1 | 5 | 5 | 5 | 0 | 8 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 5 行（逻辑 5 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/VoiceWaveform.tsx` | 1 | 4 | 2 | 1 | 0 | 3 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `warpmcp/src/tools/chat_search.ts` | 1 | 3 | 2 | 2 | 0 | 3 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 2 行（逻辑 2 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `server/src/services/chatSearchToolService.ts` | 1 | 3 | 1 | 1 | 0 | 6 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 1 行（逻辑 1 / 字面量类型注释 0），可整段取 upstream 后回贴 |
| `app/src/pages/Chat/assistant-ui/slash-command/SlashCmdDropdown.tsx` | 1 | 3 | 7 | 4 | 1 | 3 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 4 行（逻辑 1 / 字面量类型注释 3），可整段取 upstream 后回贴 |
| `app/src/globals.d.ts` | 1 | 3 | 3 | 3 | 0 | 0 | M3-取upstream+回贴少量补丁 | fork 非-i18n 新增仅 3 行（逻辑 0 / 字面量类型注释 3），可整段取 upstream 后回贴 |
| `warpmcp/src/tools/shell_exec.ts` | 3 | 170 | 144 | 144 | 0 | 8 | M4-逐块核对 | fork 非-i18n 新增 144 行（逻辑 49 / 字面量类型注释 95），upstream 8 行 |
| `app/package.json` | 1 | 168 | 86 | 85 | 0 | 0 | M4-逐块核对 | fork 非-i18n 新增 85 行（逻辑 2 / 字面量类型注释 83），upstream 0 行 |
| `app/src/pages/Home/Steps/LoadModelStep.tsx` | 1 | 138 | 23 | 12 | 1 | 11 | M4-逐块核对 | fork 非-i18n 新增 12 行（逻辑 2 / 字面量类型注释 10），upstream 11 行 |
| `app/src/pages/Home/Steps/RegisterBackendStep.tsx` | 1 | 136 | 22 | 14 | 1 | 11 | M4-逐块核对 | fork 非-i18n 新增 14 行（逻辑 4 / 字面量类型注释 10），upstream 11 行 |
| `bridge/src/orchestrator/index.ts` | 11 | 134 | 105 | 105 | 0 | 167 | M4-逐块核对 | fork 非-i18n 新增 105 行（逻辑 30 / 字面量类型注释 75），upstream 167 行 |
| `server/src/services/initRealm.ts` | 3 | 125 | 93 | 93 | 0 | 11 | M4-逐块核对 | fork 非-i18n 新增 93 行（逻辑 40 / 字面量类型注释 53），upstream 11 行 |
| `shared/src/enums.ts` | 3 | 103 | 31 | 31 | 0 | 3 | M4-逐块核对 | fork 非-i18n 新增 31 行（逻辑 2 / 字面量类型注释 29），upstream 3 行 |
| `shared/src/flagMappings.ts` | 6 | 97 | 78 | 78 | 0 | 5 | M4-逐块核对 | fork 非-i18n 新增 78 行（逻辑 28 / 字面量类型注释 50），upstream 5 行 |
| `bridge/package.json` | 1 | 96 | 48 | 48 | 0 | 0 | M4-逐块核对 | fork 非-i18n 新增 48 行（逻辑 2 / 字面量类型注释 46），upstream 0 行 |
| `app/src/components/Shell.tsx` | 8 | 95 | 17 | 15 | 0 | 30 | M4-逐块核对 | fork 非-i18n 新增 15 行（逻辑 0 / 字面量类型注释 15），upstream 30 行 |
| `app/src/pages/Recipes/StepPanel.tsx` | 3 | 91 | 35 | 26 | 7 | 12 | M4-逐块核对 | fork 非-i18n 新增 26 行（逻辑 2 / 字面量类型注释 24），upstream 12 行 |
| `app/src/pages/Hub/DownloadManager.tsx` | 5 | 89 | 36 | 23 | 11 | 22 | M4-逐块核对 | fork 非-i18n 新增 23 行（逻辑 2 / 字面量类型注释 21），upstream 22 行 |
| `bridge/src/types/index.ts` | 2 | 83 | 41 | 41 | 0 | 6 | M4-逐块核对 | fork 非-i18n 新增 41 行（逻辑 3 / 字面量类型注释 38），upstream 6 行 |
| `app/src/components/ResizeHandles.tsx` | 1 | 78 | 46 | 46 | 0 | 2 | M4-逐块核对 | fork 非-i18n 新增 46 行（逻辑 6 / 字面量类型注释 40），upstream 2 行 |
| `warpmcp/src/tools/fetch.ts` | 1 | 72 | 111 | 111 | 0 | 4 | M4-逐块核对 | fork 非-i18n 新增 111 行（逻辑 57 / 字面量类型注释 54），upstream 4 行 |
| `server/src/services/releases.ts` | 5 | 59 | 10 | 10 | 0 | 65 | M4-逐块核对 | fork 非-i18n 新增 10 行（逻辑 10 / 字面量类型注释 0），upstream 65 行 |
| `app/src/pages/Chat/assistant-ui/mermaid-diagram.tsx` | 3 | 52 | 9 | 8 | 0 | 17 | M4-逐块核对 | fork 非-i18n 新增 8 行（逻辑 2 / 字面量类型注释 6），upstream 17 行 |
| `shared/src/types.ts` | 4 | 46 | 39 | 39 | 0 | 16 | M4-逐块核对 | fork 非-i18n 新增 39 行（逻辑 7 / 字面量类型注释 32），upstream 16 行 |
| `bridge/src/persistence/betterSqlite.ts` | 4 | 45 | 17 | 17 | 0 | 213 | M4-逐块核对 | fork 非-i18n 新增 17 行（逻辑 2 / 字面量类型注释 15），upstream 213 行 |
| `app/src/main.tsx` | 2 | 44 | 28 | 28 | 0 | 16 | M4-逐块核对 | fork 非-i18n 新增 28 行（逻辑 10 / 字面量类型注释 18），upstream 16 行 |
| `app/src/applets/lib/AppletHostFE.ts` | 3 | 43 | 9 | 9 | 0 | 10 | M4-逐块核对 | fork 非-i18n 新增 9 行（逻辑 3 / 字面量类型注释 6），upstream 10 行 |
| `server/src/routes/clientLogs.ts` | 1 | 35 | 32 | 32 | 0 | 2 | M4-逐块核对 | fork 非-i18n 新增 32 行（逻辑 10 / 字面量类型注释 22），upstream 2 行 |
| `package.json` | 1 | 34 | 23 | 22 | 0 | 0 | M4-逐块核对 | fork 非-i18n 新增 22 行（逻辑 0 / 字面量类型注释 22），upstream 0 行 |
| `app/src/pages/Chat/assistant-ui/AnnotationsBox.tsx` | 3 | 33 | 17 | 13 | 2 | 7 | M4-逐块核对 | fork 非-i18n 新增 13 行（逻辑 0 / 字面量类型注释 13），upstream 7 行 |
| `server/src/services/whisperProcessManager.ts` | 1 | 33 | 20 | 20 | 0 | 62 | M4-逐块核对 | fork 非-i18n 新增 20 行（逻辑 11 / 字面量类型注释 9），upstream 62 行 |
| `warpmcp/src/auth.ts` | 2 | 29 | 10 | 10 | 0 | 10 | M4-逐块核对 | fork 非-i18n 新增 10 行（逻辑 6 / 字面量类型注释 4），upstream 10 行 |
| `app/src/hooks/useRealm.ts` | 1 | 27 | 35 | 35 | 0 | 15 | M4-逐块核对 | fork 非-i18n 新增 35 行（逻辑 9 / 字面量类型注释 26），upstream 15 行 |
| `app/src/pages/Servers/StatusBadge.tsx` | 1 | 27 | 16 | 10 | 4 | 3 | M4-逐块核对 | fork 非-i18n 新增 10 行（逻辑 3 / 字面量类型注释 7），upstream 3 行 |
| `server/src/services/checkpointService.ts` | 1 | 27 | 28 | 28 | 0 | 69 | M4-逐块核对 | fork 非-i18n 新增 28 行（逻辑 13 / 字面量类型注释 15），upstream 69 行 |
| `server/src/routes/models.ts` | 1 | 20 | 13 | 13 | 0 | 23 | M4-逐块核对 | fork 非-i18n 新增 13 行（逻辑 6 / 字面量类型注释 7），upstream 23 行 |
| `app/src/hooks/useThreadConfig.ts` | 1 | 17 | 19 | 19 | 0 | 24 | M4-逐块核对 | fork 非-i18n 新增 19 行（逻辑 10 / 字面量类型注释 9），upstream 24 行 |
| `bridge/src/parser/index.ts` | 1 | 16 | 7 | 7 | 0 | 8 | M4-逐块核对 | fork 非-i18n 新增 7 行（逻辑 2 / 字面量类型注释 5），upstream 8 行 |
| `app/src/components/WithErrorBoundary.tsx` | 1 | 15 | 11 | 11 | 0 | 3 | M4-逐块核对 | fork 非-i18n 新增 11 行（逻辑 1 / 字面量类型注释 10），upstream 3 行 |
| `server/src/routes/settings.ts` | 1 | 14 | 78 | 78 | 0 | 11 | M4-逐块核对 | fork 非-i18n 新增 78 行（逻辑 16 / 字面量类型注释 62），upstream 11 行 |
| `warpmcp/src/util/sandbox.ts` | 1 | 13 | 56 | 56 | 0 | 2 | M4-逐块核对 | fork 非-i18n 新增 56 行（逻辑 22 / 字面量类型注释 34），upstream 2 行 |
| `server/src/routes/update.ts` | 1 | 12 | 25 | 25 | 0 | 12 | M4-逐块核对 | fork 非-i18n 新增 25 行（逻辑 11 / 字面量类型注释 14），upstream 12 行 |
| `bridge/src/mcp/client.ts` | 1 | 11 | 13 | 13 | 0 | 27 | M4-逐块核对 | fork 非-i18n 新增 13 行（逻辑 4 / 字面量类型注释 9），upstream 27 行 |
| `realmcore/src/applet/AppletManager.ts` | 2 | 10 | 30 | 30 | 0 | 13 | M4-逐块核对 | fork 非-i18n 新增 30 行（逻辑 14 / 字面量类型注释 16），upstream 13 行 |
| `server/src/services/modelScanner.ts` | 1 | 8 | 19 | 19 | 0 | 26 | M4-逐块核对 | fork 非-i18n 新增 19 行（逻辑 10 / 字面量类型注释 9），upstream 26 行 |
| `server/src/util/chatPresets.ts` | 1 | 7 | 11 | 11 | 0 | 15 | M4-逐块核对 | fork 非-i18n 新增 11 行（逻辑 3 / 字面量类型注释 8），upstream 15 行 |
| `app/src/applets/FEApplet/FEApplet.tsx` | 4 | 1312 | 25 | 22 | 1 | 94 | X-需逐块定夺 | upstream 已把单体文件拆成 26 个组件（agents/guardrails/modes/prompts/todos/indicators + constants.ts）；fork 的 i18n 需跨新文件重新提取 |
| `server/src/services/processManager.ts` | 15 | 821 | 362 | 362 | 0 | 187 | X-需逐块定夺 | 双侧都在改 buildSpecDecodeArgsPre9100/Post9100/buildArgs：fork 加 ngram/draft-model spec-type 归一化 + Windows taskkill /T /F，upstream 同期引入新 launchserverparams |
| `server/src/services/backendValidator.ts` | 10 | 105 | 189 | 189 | 0 | 25 | X-需逐块定夺 | base 已有该文件；fork +157 行、upstream +46 行，同向演进（兼容性探测），需逐块定夺留谁的实现 |
| `server/src/services/recipeRunner.ts` | 6 | 57 | 252 | 252 | 0 | 23 | X-需逐块定夺 | fork +244 行 vs upstream +15 行，fork 侧改动更重，取 upstream 会丢 fork 逻辑 |
| `server/src/util/store.ts` | 3 | 34 | 52 | 52 | 0 | 10 | X-需逐块定夺 | fork +48 行（存储读写加固）vs upstream +1 行 |

## 12. 复现步骤

```bash
BASE=b99b2822faceafa813924d8f7bf19b39e057c194
git merge-tree --write-tree HEAD upstream/master > /tmp/merge-tree.txt   # 首行=临时 tree OID
# 冲突清单：解析 "CONFLICT (...)" 行 → path/type
# 三方内容：git show <tree>:<path>；base/ours/theirs = git show :1:/:2:/:3:<path>（在临时 merge 索引中）
# fork/upstream 自有改动：git diff -U0 $BASE..HEAD -- <path> / $BASE..upstream/master -- <path>
```

脚本：`%TEMP%\sync-survey10.ps1`（首版分类）、`sync-survey11.ps1`（最终判据：以 forkAdded 全量而非关键字）、`sync-survey13.ps1`（汇总）。
中间产物：`conflicts.csv`、`conflicts-final.csv`、`hunkkind2.csv`、`blocksize.csv`、`survey-master2.csv`（权威表）。
