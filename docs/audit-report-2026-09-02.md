# warpdrv-i18n（warpcore v0.5.8）完整审计报告

- **日期**：2026-09-02
- **范围**：全仓库（7 个 workspace 包 + landing/ + tools/ + .github/ + docs/），四轨并行审计：
  1. 架构与结构 + 代码质量（主审计员，含知识图谱 7,907 节点 / 22,738 边）
  2. 依赖与安全（专项子代理，npm audit + 逐文件审阅）
  3. i18n 实现（专项子代理，资源对比 + AST 扫描 + 硬编码扫描）
  4. 构建/测试/CI/工程规范（专项子代理，静态审阅 + 只读实测）
- **基线**：前两轮审计（`docs/audit-report.md`、`docs/code-audit-2026-08.md`）的全部修复项已回归验证在位。
- **实测说明**：vitest/tsx 因审计沙箱禁止子进程 spawn（EPERM）无法本机执行，测试通过性以 CI 为准；`npm audit` 用官方 registry 实测完成；`i18n:check`、`tsc`、`eslint` 实测通过。

---

## 1. 总体结论

**综合评分：69 / 100**（工程实践 62 · 依赖与安全 72 · i18n 72 · 代码质量/桌面壳 70）

这是一个**安全意识与工程质量显著高于平均水平**的 alpha 项目。i18n 结构面（key 一致性、CI 门禁）接近满分；服务端安全防线（SSRF/CSRF/命令执行/路径穿越/token 存储）实现质量普遍很高；npm 依赖 0 已知漏洞；git 卫生干净。

主要短板集中在三类：**① 测试债务**（核心引擎 bridge 零测试、控制面路由零集成测试、前端 0.2% 行覆盖）；**② 桌面壳权限面过宽**（全局键盘监听、任意窗口按键注入、shell 执行权限，组合成 XSS→用户级 RCE 放大链）与 **1 个真实沙箱接线失效 bug**；**③ 构建链与发布可复现性**（打包逻辑三处复制、干净 checkout 桌面构建必败、fork 更新检查指向上游）。

> 无 P0（无硬阻断、无已泄露的密钥、无依赖漏洞）。P1 共 8 条、P2 共 12 条、P3 约 20 条。

---

## 2. 评分卡

| 维度 | 分数 | 一句话结论 |
|---|---|---|
| 依赖与安全 | 72 | 防线扎实，但桌面壳权限集群 + shell_exec 沙箱接线失效是真实风险 |
| i18n | 72 | 结构与一致性满分，硬编码与错误翻译链路是主要欠账 |
| 代码质量/桌面壳 | 70 | 复杂热点集中、日志卫生一般、桌面壳加固不足 |
| 工程实践 | 62 | 测试债务重、构建链碎片化、门禁覆盖不全 |
| **综合** | **69** | 中等偏上，接近"良好"，修复清单清晰可达 |

---

## 3. 严重度分级问题清单

### P0 — 无

### P1（8 条）

| # | 类别 | 问题 | 证据 | 修复建议 |
|---|---|---|---|---|
| 1 | 安全 | **warpmcp `shell_exec` 路径沙箱接线失效**：注册 handler 时未传 `deps`，`fsAllowedRoots` 恒为空 → 工具描述承诺的"绝对路径必须落在工作区内"与 cwd 限制全部失效；命令白名单与环境剥离仍在，但模型可用白名单运行时读取任意绝对路径。其余 21 个工具均正常传 deps，`warpmcpRunner.ts:25` 也已提供 `getFsAllowedRoots`，纯接线遗漏。 | `packages/warpmcp/src/index.ts:43`（`handler: (a: any) => shellExecHandler(a)`）；`shell_exec.ts:175,214` 的 roots 判断永不成立；测试只直调带 roots 的 handler 测不到真实接线 | 改为 `shellExecHandler(a, deps.getFsAllowedRoots())`；补一条走 `buildMcpServer` 真实接线路径的测试 |
| 2 | 安全 | **桌面权限面集群（XSS→用户级 RCE 放大链）**：① rdev 无条件下发**全系统击键流**给 webview（键盘记录器级）；② `type_text` 命令用 enigo 向**当前聚焦窗口**注入按键；③ capabilities 授予无 scope 的 `shell:allow-execute`/`allow-kill`；④ Linux 下所有 webview 权限请求无条件 `request.allow()`（摄像头/麦克风/地理位置）。任一前端 XSS 即可持续监听键盘、向任意窗口注入输入、执行任意进程。 | `packages/desktop/src/main.rs:531-545, 433-462, 515-522`；`packages/desktop/capabilities/default.json:15-17` | rdev 改为仅注册热键组合且仅窗口聚焦时生效；`type_text` 加目标窗口校验；capabilities 移除 execute/kill 或加 scope；webkit 权限回调改为默认拒绝、按需放行 |
| 3 | 测试 | **bridge 全包 0 测试**：22 文件/5,349 行的核心聊天引擎（elicitationRegistry、orchestrator 1,366 行、betterSqlite 1,441 行、permissions、parser）无任何测试，且不在任何 CI typecheck/lint 门禁内。 | `packages/bridge/` 无 tests 目录、无 scripts 字段；ci.yml 无 bridge 步骤 | 优先给 elicitationRegistry/orchestrator/persistence 建测试；bridge+warpmcp 接入 CI tsc 与 eslint（本地 tsc 已过，零成本） |
| 4 | 测试 | **server 25 个路由 0 集成测试 + app 0.2% 行覆盖**：auth/chat/proxy 等控制面路由裸奔；app 34,580 行仅 1 个 59 行测试，vitest 配置无 jsdom（无组件测试能力）。全仓库零覆盖率工具。 | `packages/server/src/routes/*` 无对应测试；`packages/app/tests/` 仅 runtimeState.test.ts；4 个 vitest.config.ts 均 node 环境 | 接入 vitest coverage（v8）；先给 auth/chat/proxy 写 supertest 级集成测试；设最低门禁（如 30% 递增） |
| 5 | 工程 | **构建链碎片化**：server 打包逻辑（esbuild+pkg+依赖复制）三处复制——`release.sh:142-166`、`windows-msi.yml:57-60`、`.github/scripts/copy-runtime-deps.cjs`；`npm run build:desktop` 在干净 checkout 必然失败（binaries/app-dist 被 gitignore 且无生成机制）。 | 上述三处 + 根 `package.json:14`；`.gitignore:16-17` | 在 packages/server 建 build 脚本收敛三份逻辑；为 binaries/app-dist 提供生成/占位机制 |
| 6 | i18n | **服务端错误按文本匹配翻译（架构缺陷）**：`translateServerError` 以英文文本反查 key，127 处服务端错误仅 84 处命中，43 处漏译（'Authentication required'、'Too many requests' 等）；chat.ts 发 'serverId required' 而资源是 'Server ID is required' → **永远匹配不上**；动态错误（`String(err)`）不可译。errors.* 的 UPPER_SNAKE key 名表明本意是错误码。 | `api/translateError.ts:10-49`；`routes/chat.ts:80,103,197,728` vs `common.json:138-139,154`；`middleware/auth.ts:97,109` | 服务端改发 `{code, params}` 结构化错误码，客户端按 code 映射 t() |
| 7 | i18n | **聊天关键路径 20+ 处硬编码文案**：PendingToolCallsBox（整文件无 useTranslation，Dismiss/Allow Once/Allow Always/Deny）、ToolCallBlockCollapsible、thread.tsx（Delete Message/Send a message.../Stop generating 等 10 处，chat.json 已有 deleteMessage key 未用）、ChatSidebar 7 个面板标题、WorkspaceView、FEApplet、SpeculativeDecodingCard、WithErrorBoundary（Something went wrong/Retry）。 | `PendingToolCallsBox.tsx:246,305,324,343`；`thread.tsx:225-1337`；`WithErrorBoundary.tsx:15,20` 等 | 全部改 t()；扩展 check-i18n.mjs 增加 JSX 字面量文案 lint |
| 8 | i18n | **28 处 `t(key,{count})` 零复数形式**：资源中 0 个 `_one/_other`，靠 "(s)"/"(es)" hack（"match(es)"、"checkpoint(s)"），未来加任何有复数语言即坏。 | `chat.json:27`、`checkpoints.json:33`；`ChatSearchDialog.tsx:261` 等 28 处调用 | 补齐 i18next 复数形式（_one/_other） |

### P2（12 条）

| # | 类别 | 问题 | 证据 | 修复建议 |
|---|---|---|---|---|
| 1 | 功能 | **shell_exec EVAL_FLAGS 过度拦截**（实测复现）：eval 旗标检查作用于**所有**白名单命令，`mkdir -p`、`cp -r`、`rm -r`、`grep -i`、`wc -c` 等常见用法全部被拒（注释声称仅限 node/npm/cargo 等运行时）。 | `shell_exec.ts:157-161`；纯 node 复刻正则语义验证 REJECT 上述 5 例 | EVAL_FLAGS 检查收窄到运行时命令组（node/npm/npx/yarn/pnpm/cargo/rustc/clippy-driver） |
| 2 | 安全 | **全局速率限制缺失**：rateLimiter 仅挂载于 /api/client-log；登录（bcrypt 比较）与控制面全部无限流。本地应用为主可容忍，暴露非回环后无暴力破解/DoS 阻尼。 | `clientLogs.ts:33` 唯一挂载点；`index.ts` 其余路由无 rateLimiter | rateLimiter 挂到 /api（至少 auth/login 与代理 /v1） |
| 3 | 安全/工程 | **生产构建无压缩 + 全量 sourcemap + 常驻 DevTools**：`build: { sourcemap: true, minify: false }`；Cargo.toml 启用 devtools feature 且托盘菜单常驻 "Toggle DevTools"。 | `vite.config.ts:102`；`main.rs:600-601,631-639` | 生产 `minify: true`、`sourcemap: false`；release 构建去除 devtools feature/托盘项 |
| 4 | 安全 | **生产前端无有效 CSP/安全响应头**：serveStatic 直接 express.static 无 CSP、无 nosniff；桌面窗口实际加载 http://localhost:4400（本地 HTTP 源），Tauri 的 csp 配置基本不生效且含 `script-src 'unsafe-inline'`。 | `serveStatic.ts:42-56`；`tauri.conf.json:28`；`main.rs:178-181` | serveStatic 对 index.html 注入 CSP + X-Content-Type-Options: nosniff；收紧/移除 Tauri CSP 的 unsafe-inline |
| 5 | 工程 | **fork 更新检查指向上游**：release.json 的 updateCheckUrl/downloadUrl 指向 mikjee/warpdrv，fork 构建的应用会提示"v0.6.17 可用"并引导用户安装上游版本（丢失 zh-CN i18n 与全部安全加固）。 | `release.json:3-4`；`routes/update.ts:55-100` | 指向 fork 自己的发布；或未发布前禁用更新提示 |
| 6 | 工程 | **CI 门禁覆盖不全**：bridge 与 warpmcp 无 typecheck/lint 步骤；无覆盖率门禁；无 Prettier/.editorconfig（TS 格式约定零工具强制）；Windows MSI 流程只跑 realmcore 测试+i18n，无 lint/typecheck/其余测试。 | `ci.yml:27-58`；`windows-msi.yml:41-51` | bridge/warpmcp 接入 tsc+eslint；引入 Prettier/.editorconfig；MSI 流程补全门禁 |
| 7 | 工程 | **release workflow 版本 bump 丢弃**：release.sh 改写 release.json/tauri.conf.json/package.json/package-lock.json 但 workflow 从不 commit/push；无签名/校验和步骤；仅手动触发；无 macOS 发布。 | `release.yml:54-94`；`release.sh` | workflow 增加 commit+tag（或由 tag 触发）；补 SHA256 校验和 |
| 8 | 工程 | **版本事实源分散（4 处）**：warpmcp 硬编码 `version: '0.5.8'`（第 4 个事实源，注释要求手动同步）；health 端点已正确读 getLocalVersion。 | `warpmcp/src/index.ts:64-65` | 运行时读 release.json（同 getLocalVersion 模式） |
| 9 | i18n | **日期/时长格式化未本地化**：3 处硬编码 `toLocaleDateString('en-US')`（中文界面显示英文月份）；CheckpointsPage 手写未翻译 formatAge（"Xm ago"）与 LoadCheckpointDialog 的 i18next 实现重复且不一致。 | `AccessTokensSection.tsx:131`、`HubModelDetail.tsx:91`、`WorkspaceView.tsx:24`、`CheckpointsPage.tsx:23-31` | 以 i18n.resolvedLanguage 驱动 Intl.DateTimeFormat/RelativeTimeFormat 封装 |
| 10 | 工程 | **landing 与主包管线完全脱钩**：不在 workspaces/CI/发布流程，依赖裸星号 `"astro": "*"`，无 i18n，`landing/original/` 遗留 HTML（已 gitignore 但在盘上）。 | `landing/package.json:11-12`；`.gitignore:46-47` | 决策去留：纳入 CI 并锁版本，或移出仓库；删除 original/ |
| 11 | 安全 | **下载的 llama.cpp/whisper.cpp 二进制无校验**：releases.ts 取 GitHub latest 资产直接下载执行（仅 TLS+GitHub 信誉）。 | `routes/releases.ts`（subagent 审阅） | 发布清单加 SHA256 校验 |
| 12 | 测试 | **desktop Rust 0 测试**（742 行 sidecar 编排/端口解析/窗口持久化无 #[test]）。 | `packages/desktop/src/main.rs` | 至少给 get_server_port/窗口大小解析加单测 |

### P3（要点节选，共约 20 条）

| 类别 | 问题 | 证据 |
|---|---|---|
| 代码质量 | 23 处空 catch，多数合理（最佳努力清理）；`sseManager.ts:95` 断连处理器静默吞错值得加日志 | grep 全仓 |
| 代码质量 | 250+ 处 console.* 直用，server 有 logger.ts 但未全面接入；`index.ts:131-134` 打印 HOME/PATH/execPath | grep 全仓 |
| 代码质量 | main.tsx 覆盖 console.error 时对参数 JSON.stringify，循环引用会抛异常破坏错误日志 | `main.tsx:68-75` |
| 代码质量 | `ElicitationRegistry` 无 TTL：未应答的 elicitation Promise 永久悬挂 | `bridge/src/mcp/elicitationRegistry.ts:13-17` |
| 代码质量 | `extractModelFromMultipart` 无调用点死代码（前次 L5 遗留）；`useEventSource.ts:8` @ts-ignore | `modelProxy.ts:98` |
| 安全 | vite dev 中间件 /onnxruntime、/vad 路径拼接可 `..` 逃逸（仅 dev，但 dev server 绑 0.0.0.0） | `vite.config.ts:44-74,108-110` |
| 安全 | SSE 会话无连接上限（前次 L2 遗留）；store 全量同步写盘（L3 遗留，已有原子写+回滚缓解） | `sseManager.ts:64`、`store.ts:64-77` |
| 安全 | .gitignore 无 `.env*` 模式；MCP env 密钥明文落盘无 UI 提示 | `.gitignore` |
| i18n | 数字后缀重复 key（enableThinking/enableThinking2、auto2、serverS 等 8 组）；无 missingKeyHandler；无 RTL（dir 属性）就绪；index.html 静态 lang="en" | `zh-CN/common.json` |
| 工程 | shared/realmcore/warpmcp 未开 noUncheckedIndexedAccess；无 engines/packageManager 字段；pkg 三平台 node 版本不一（win22/linux24/mac24）；tag 命名不统一（v0.5.8_beta） | 各 tsconfig；release.sh |
| 工程 | tools/update-claude-filelist.{sh,ts} 双实现死工具（目标 CLAUDE.md 被 gitignore 且不存在） | `.gitignore:43` |
| 文档 | docs/architecture.md 将 realmcore 误标为"Rust 原生核心"（实为 TypeScript，Rust 在 desktop） | `docs/architecture.md:23` |
| 工程 | Tauri 托盘菜单英文（Show warpdrv/Hide/Restart Server/Quit） | `main.rs:597-601` |

---

## 4. 前次审计回归验证（全部通过）

| 前次修复项 | 当前状态 |
|---|---|
| A1 代理 CORS 收紧（非浏览器客户端放行 + 本地来源白名单） | ✅ 在位，`modelProxy.ts:207-213` 注释完备 |
| A2 代理按 token 推理权限（_rawBody 解析 model） | ✅ 在位，`modelProxy.ts:315` |
| M1 控制面 CSRF（非本地 Origin 状态变更 403） | ✅ 在位，`index.ts:220-227` |
| M2 非回环绑定强制鉴权 | ✅ 在位（settings 路由 400 拒绝） |
| M3 recipe 白名单死代码清理 | ✅ 已移除（注释说明威胁模型） |
| M4 generic download 校验 | ✅ 在位 |
| L1 代理透传 authorization 头剥离 | ✅ 在位 |
| S1 sharp/libvips 高危漏洞 | ✅ override 0.35.3，npm audit 实测 **0 漏洞**（全量 1,496 依赖，官方 registry） |
| S2 推理端口默认 127.0.0.1 | ✅ `inferenceExposeExternal: false`（`types.ts:412`） |
| 遗留 L2/L3/L5 | ⚠️ SSE 无连接上限（L2）、全量同步写盘（L3）、`extractModelFromMultipart` 死代码（L5）仍在 |

---

## 5. fork / 上游同步状态（关键运营风险）

- 当前分支 `chore/upstream-sync-survey`，工作树干净；origin = jerrydong1988/warpdrv，upstream = mikjee/warpdrv。
- **领先 48 / 落后 66 提交**（upstream 已到 v0.6.17；本 fork 停留 v0.5.8）。
- 冲突摸底（`docs/upstream-sync-conflict-survey.md`）已量化：merge-tree 演练 220 个冲突路径；其中 **仅 59 个是纯 i18n 机械冲突**；fork 在冲突文件里有 3,469 行自己的非-i18n 改动（MCP 命令白名单、SSRF 拦截、spec-decode 归一化、Windows 进程树清理等安全加固）——**按直觉取 upstream 会静默删掉这些**。
- 建议维持路线 B（按需 cherry-pick upstream 修复）而非全量合并（估算 23–26 人日 vs ≤10 人时）。
- **i18n 是 fork 独有价值**：upstream 至今无任何 locale 文件，zh-CN 层不会被上游重复实现。

---

## 6. 良好实践清单（值得肯定）

- **依赖**：npm audit 0 漏洞；overrides 均合理（版本对齐/CVE 保险丝）；patches 良性（权限位 + kokoro 语音 URL 可配置）；无 axios/webpack-dev-server 等 CVE 大户；无密钥/秘密入库（仅测试文件假值）。
- **服务端安全**：token bcrypt(10)+32B 随机+prefix 防 bcrypt DoS；Cookie httpOnly+SameSite=strict；CORS/CSRF 本地来源白名单（正则锚定防绕过）；warpmcp fetch 工具 CIDR 级 SSRF 封禁+DNS pinning+逐跳复检；zip/tar-slip 防护；下载路径白名单；shell-quote 去操作符+无 shell spawn；MCP 文件工具双层 realpath 沙箱（fail-closed）；client-log 16KB+限流+字段截断。
- **XSS 面小**：全仓 0 处 eval/new Function；DOMPurify 消毒 mermaid SVG 与 HF README；无 rehype-raw；mermaid securityLevel strict。
- **i18n 结构面满分**：14 命名空间 × 2 语言各 1,392 key 完全对称（缺失/多余/占位符 0）；CI 强制 `i18n:check`（AST 级校验 t() 引用 + 编码损坏检测）；I18nGate 阻塞渲染至初始化完成；语言切换持久化+document.lang 更新。
- **工程**：git 卫生干净（592 文件/6.65 MiB、无大文件/二进制入库）；.gitattributes 完备；CONTRIBUTING 约定（DCO、tab、T/I/E 前缀、no any）与代码实际一致；store.ts 原子写+失败回滚+备份轮换；控制面启动有安全姿态警告日志。

---

## 7. 修复路线（按优先级）

| 序 | 优先级 | 事项 | 预估成本 |
|---|---|---|---|
| 1 | 🔴 | 修 shell_exec 接线（1 行 + 真实接线测试） | <1h |
| 2 | 🔴 | 收紧桌面权限面 4 项（键盘监听/type_text/shell 权限/webkit 回调） | 1–2d |
| 3 | 🟠 | bridge 核心测试 + bridge/warpmcp 接入 CI 门禁 | 2–3d |
| 4 | 🟠 | 错误码化（结构化 {code,params}）+ 聊天硬编码清零 + i18n:check 增硬编码 lint | 3–4d |
| 5 | 🟠 | 收敛 server 打包为单一脚本；build:desktop 可复现；release workflow 持久化版本 bump | 1–2d |
| 6 | 🟠 | 生产 CSP/安全头 + minify/sourcemap + 全局限流 + 下载二进制校验 | 1–2d |
| 7 | 🟠 | shell_exec EVAL_FLAGS 收窄到运行时命令组（修复 mkdir -p/grep -i 误拒） | <1h |
| 8 | 🟡 | release.json 指向 fork 自己的发布（或禁用更新提示） | <1h |
| 9 | 🟡 | 覆盖率基线（vitest coverage）+ auth/chat/proxy 路由集成测试 | 2–3d |
| 10 | 🟡 | 版本事实源统一（warpmcp 读 release.json）+ Prettier/.editorconfig + eslint 全包推广 | 1d |

建议修复顺序 1→2→7→8（安全快速胜利）→ 3→4→5→6（结构性）→ 9→10（增量）。

---

*四轨审计证据链：主审计员代码质量/架构/桌面壳自查 + 三个专项子代理报告（工程实践 62 分、i18n 72 分、依赖与安全 72 分）。全部关键发现经主审计员抽样复核（shell_exec 接线、EVAL_FLAGS 误拒、translateServerError 文本匹配、PendingToolCallsBox 硬编码、release.json 指向上游等均逐条验证）。*
