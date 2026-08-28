# warpdrv 项目完整审计报告

- **项目**: warpdrv (Local LLM Server Manager + llama.cpp + Chat)
- **仓库**: `warpdrv-i18n` — fork of `mikjee/warpdrv`; 审计在 `codex/i18n-zh-CN-clean` 上完成, 该分支已全部并入 `master`(见文末「后续状态更新」)
- **版本**: root `package.json` / `release.json` / `tauri.conf.json` / 全部 workspace 包 / Cargo.toml 统一为 `0.5.8`
- **审计依据**: Codebase Memory 知识图谱 (http://localhost:9749/, 已于审计前重新索引, `index-status: done`) + 源码直接核查
- **图谱规模**: 7,950 节点 / 22,204 边 / 529 个文件, 索引覆盖率良好(仅 2 个非代码文件部分解析)

---

## 1. 总体结论

项目整体健康状况 **良好**, 处于 alpha 阶段但工程质量高于平均水准:

- i18n(本次分支主题)完成度极高: 14 个命名空间、1392 个 key(审计时 1382, 后续新增 10), en/zh-CN **完全对称** — 无缺失 key、无多余 key、无占位符 `{{x}}` 不匹配。
- 安全基线扎实: 最近 9 次提交中有 4 次是安全加固(认证、命令注入、XSS、限流、依赖升级)。
- 知识图谱显示 **0 个 dead-code 节点**, 代码结构干净。
- CI 覆盖类型检查、前端构建、i18n 校验、lint、Rust fmt/clippy 与三套单元测试。

---

## 2. 图谱发现 (知识图谱驱动)

### 2.1 节点构成
| Label | 数量 | 说明 |
|---|---|---|
| Variable | 3,822 | 含 i18n JSON key(图谱将 JSON key 计为变量) |
| Function | 1,496 | |
| File / Module | 529 / 527 | |
| Interface / Type / Enum | 349 / 115 / 39 | shared 类型丰富 |
| Method | 311 | |
| Route | 305 | server 路由+前端页面 |
| Section | 295 | i18n JSON 段 |
| Class / Struct | 32 / 2 | |
| EnvVar | 11 | |

状态分布: `structural` 6,143 / `exported` 1,217 / `entry` 582 / `test` 8 — **无 dead 节点**。

### 2.2 边构成(前 10)
USAGE 8,541 · DEFINES 6,990 · IMPORTS 2,403 · CALLS 2,272 · CONTAINS_FILE 529 · CONFIGURES 388 · DEFINES_METHOD 311 · FILE_CHANGES_WITH 197 · WRITES 166 · HTTP_CALLS 106 — 语义边(INHERITS/OVERRIDE/IMPLEMENTS/HANDLES/LISTENS_ON/RAISES)齐全, 图谱质量高。

### 2.3 覆盖缺口(missed_graph)
仅 2 个文件部分解析, 均为非代码文件, 可接受:
- `packages/app/src/pages/Chat/assistant-ui/styles/assistant-ui.css`(CSS)
- `tools/update-claude-filelist.sh`(shell)

### 2.4 跨包引用(图谱值, 需甄别)
真实依赖(经源码核对):
- `app → shared`(1,006)· `server → shared`(740) — 正确方向, 大量类型共享
- `app → bridge`(425)· `server → bridge`(87)· `bridge → shared`(24) — 符合 README 架构
- 图谱中的 `server → app`(546)、`shared → app`(130)、`bridge → app`(276) 经核实 **全部为索引器误报**(`fetch`/`next`/`new`/`ok` 等全局符号被解析到 app 包文件), 源码中不存在 server/bridge/shared 反向 import app 的语句。结论: 实际包依赖方向正确。

---

## 3. 架构审计

### 3.1 包结构(7 个 workspace 包)
| 包 | 角色 | 依赖 |
|---|---|---|
| `shared` | 纯类型+枚举+工具, **零 workspace 依赖** | 无 |
| `bridge` | 可组合聊天引擎(server/app 共用) | shared, realmcore |
| `realmcore` | 事件/Applet 框架(被 server+app 共用) | 无 workspace 依赖 |
| `server` | Express + SQLite, 进程管理/GGUF/食谱 | shared, bridge, realmcore, warpmcp |
| `warpmcp` | 内置 MCP 服务器 | shared |
| `app` | React 19 + Chakra UI v3 + Zustand 前端 | shared, bridge, realmcore |
| `desktop` | Tauri 2 (Rust) 外壳 | 无 |

### 3.2 已修复问题

**[A1] shared → bridge 反向类型依赖 — 已修复 ✅**
`shared` 曾从 `@warpcore/bridge` 引入 `IMessagePart`/`TThreadId`/`TMessageId`/`EChatRole` 等类型, 造成 shared↔bridge 循环(类型层)。
修复: 新建 `packages/shared/src/chat-types.ts` 承载这些基础类型; `bridge/src/types/index.ts` 改为从 `@warpcore/shared` re-export(消费者无感); 并给 bridge 补上对 shared 的正式依赖声明。

**[A2] realmcore 深路径导入 — 已修复 ✅**
`app`/`server` 曾直接 `import ... from '@warpcore/realmcore/src/applet/types'`。
修复: realmcore `package.json` 增加 `exports` 映射(`"."` + `"./src/applet/types"`); `TAppletBaseAPI` 从 applet 桶导出; 两处调用方改为根导入。

**[A3] 版本不同步 — 已修复 ✅**
root/release.json/tauri.conf.json = 0.5.8, 但 7 个 workspace 包与 Cargo.toml 均为 0.1.0, warpmcp MCP server 与 `/api/health` 也硬编码 0.1.0。
修复: 全部统一为 `0.5.8`; `/api/health` 改为从 `release.json` 读取(`getLocalVersion`, 单一事实源); warpmcp 版本号同步。

**[A4] 文档过时 — 已修复 ✅**
README Monorepo 结构补入 `realmcore`/`warpmcp`, 技术栈补 i18next; 修正两个失效的指南链接(`proxy-auth.md`→`proxy.md`, `kv-checkpoints.md`→`checkpoints.md`); 删除已废弃的 `docs/old/` 目录。

**[A5] main.rs 字符串解析 JSON — 已修复 ✅**
`get_server_port` 原用 `split("\"apiPort\"")` 文本解析 `warpcore-data.json`。
修复: 改用 `serde_json` 严格解析(`settings:general` 为 JSON 字符串, 双层解析), 并顺手通过 `cargo clippy -D warnings` 与 `cargo fmt`。

---

## 4. 安全审计

### 4.1 已加固项(确认到位)
- **认证**: `auth.ts` — 本地回环默认放行, 远程强制; cookie + Bearer; `adminMiddleware` 门禁控制面路由; 令牌区分 admin / inference(按 model alias 白名单)/ mcp_labelled / mcp_inline。
- **令牌**: `tokens.ts` — `wc_` + 32 字节随机; bcrypt 哈希; 快速预过滤防 bcrypt CPU DoS。
- **进程启动**: `processManager.ts` — `spawn(binary, args[])` 无 shell; 用户 `extraArgs` 用 `shell-quote` 词法解析; 关键旗标由代码在用户参数之后追加。
- **限流**: `rateLimiter.ts` — 300 req/min/IP + 周期清理。
- **CORS**: 仅允许本地来源; **请求体**: `express.json({ limit: '32mb' })`。
- **Cookie**: `httpOnly: true` + `sameSite: 'strict'` + 生产 `secure`(审计时确认, 无需改动)。

### 4.2 已修复风险

**[S1] sharp/libvips 高危漏洞 — 已修复 ✅**
`npm audit` 原报 3 high(CVE-2026-33327/8、CVE-2026-35590/1, GHSA-f88m-g3jw-g9cj, 经 kokoro-js → @huggingface/transformers → sharp 0.34.5 引入)。
修复: root `overrides` 强制 `sharp ^0.35.3`(官方修复线, 见 [wacrm 修复提交](https://github.com/ArnasDon/wacrm/commit/d6be5d7c3b1dd771a44445a92d61f81422889af0)); 工作区中未提交的 `kokoroService.ts` 缓解补丁(block 解码器)因根因已消除而**还原**, 不留死代码。复查 `npm audit`: **0 漏洞**。

**[S2] llama-server 默认 0.0.0.0 暴露 — 已修复 ✅**
推理端口原强制 `--host 0.0.0.0`, 局域网内任何人可直连无鉴权端点(绕开 proxy 认证; proxy 本身经核实始终拨 `127.0.0.1`)。
修复: 新增 `ISettings.inferenceExposeExternal`(默认 `false`)→ llama-server 默认绑定 `127.0.0.1`, 仅显式开启时绑定 `0.0.0.0`; 设置页新增开关(`sections.inferenceExpose`), en/zh-CN 文案同步。

**[S3] cookie 属性 — 审计确认无需改动 ✅**
已含 `httpOnly` + `sameSite: strict`, 生产环境 `secure`。

### 4.3 测试加固(新增)
- `packages/server/tests/buildArgs.test.ts`(15 用例): host 绑定默认值/开关、`--host/--port` 追加顺序防覆盖、shell-quote 引号分词、`-fa/-ngl` 去重、spec-decode 新旧两套参数、`--slot-save-path` 注入。
- `packages/server/tests/rateLimiter.test.ts`(4 用例): 限额内放行、超限 429、按 IP 独立、窗口重置。
- `packages/server/tests/tokenAccess.test.ts`(8 用例): inference/labelled/inline 访问谓词 + `isRemote` 判定。
- `packages/warpmcp/tests/shell_exec.test.ts`(10 用例): 白名单、shell 解释器拦截、元字符/控制字符、eval 旗标、凭据注入、路径穿越。

---

## 5. i18n 审计(本次分支主题) — 结论: 优秀

- 14 个命名空间 × 2 语言, **每语言 1,392 个 key**, 完全对称: 缺失 zh 0 / 缺失 en 0 / 占位符不匹配 0(本次新增 3 个 key: `sections.inferenceExpose`、`descriptions.inferenceExpose`、`switches.exposeInference`)。校验仅提示 63 个 en/zh 取值相同的产品名/技术术语, 属预期。
- CI 有 AST 级校验 `check-i18n.mjs`: 解析所有 `t()` 调用、校验 key/命名空间/占位符/编码损坏。
- 根目录无残留硬编码 UI 字符串。

---

## 6. 测试与 CI 审计 — 已加固

- **测试**: realmcore 225 + server 28 + warpmcp 10 = **263 个测试**, 全部通过。
- **CI** (`ci.yml`) 现已覆盖: i18n 校验 → **lint(eslint, shared+realmcore)** → realmcore/server/warpmcp 测试 → shared/realmcore `tsc -b` → server/app `tsc --noEmit` → vite build → **Rust: cargo fmt --check + clippy -D warnings**(新增 `rust-check` job, 含 Tauri 系统依赖与 sidecar stub 处理)。
- eslint 顺手修复 realmcore 3 处 `any`(applet 泛型故意保留, 带 eslint-disable 注释说明)+ 1 处冗余 `!!`。

---

## 7. 代码质量观察(抽查)

- `processManager.ts` spec-decode 新旧两套参数逻辑已被单元测试锁定。
- `packages/desktop/src/main.rs` 端口解析已改用 serde_json, clippy/fmt 干净。
- 图谱孤儿导出函数(如 `sseHandlers.ts` 62 个、`betterSqlite.ts` 62 个)经核对均为**事件名/按名分发 API**, 属于正常模式, 不是死代码。
- 依赖树: `npm audit` **0 漏洞**; 为防止 npmjs registry 元数据漂移再次破坏构建, root `overrides` 锁定了 assistant-ui 系列(core 0.1.13 / store 0.2.6 / react 0.12.24 等, 上游 core 0.1.15+ 引入了 store 不存在的导出)、i18next 26.3.4、typescript 5.9.3(上游 6.0 弃用 baseUrl 会报错)——与原始 lockfile 验证过的组合一致。

---

## 8. 行动清单 — 全部完成 ✅

| # | 优先级 | 事项 | 状态 |
|---|---|---|---|
| 1 | 🔴 高 | sharp/libvips 高危漏洞 | ✅ override 强制 0.35.3, audit 归零 |
| 2 | 🔴 高 | 跟踪 GHSA-f88m-g3jw-g9cj | ✅ 已修复, 缓解补丁移除 |
| 3 | 🟠 中 | 推理端口默认 127.0.0.1 | ✅ 新增 inferenceExposeExternal 开关 + UI |
| 4 | 🟠 中 | 拆分 shared↔bridge 类型循环 | ✅ chat-types.ts + re-export |
| 5 | 🟠 中 | realmcore exports 子路径 | ✅ exports 映射 + 根导出 |
| 6 | 🟠 中 | 补 server/warpmcp 核心测试 | ✅ 38 个新测试 |
| 7 | 🟡 低 | CI lint + Rust 检查 | ✅ eslint + fmt/clippy job |
| 8 | 🟡 低 | README/文档同步 | ✅ 包结构/链接/docs-old |
| 9 | 🟡 低 | 版本统一 | ✅ 全 0.5.8 + health 端点读 release.json |
| 10 | 🟡 低 | main.rs serde_json | ✅ 严格 JSON 解析 |

*报告生成于 Codebase Memory 图谱重新索引完成之后; 图谱数据(7,950 节点)与源码抽查交叉验证。*

---

## 9. 后续状态更新 (2026-08-28)

上文各节保留为审计当时的快照, 本节记录**当前实测**状态, 数字均来自本机命令输出。

### 9.1 分支与远端

| 项 | 值 |
|---|---|
| 版本 | `0.5.8`(root / `release.json` / tauri / 7 个 workspace 包一致) |
| 上游 | fork 领先 `upstream/master` **26** 个提交, 落后 **66** 个(上游已到 **0.6.17**) |
| 已合并分支 | `codex/i18n-zh-CN-clean` 已全部并入 `master`, 本地与远端分支均已删除 |
| 在途 PR | #3 `codex/fix-mcp-autostart` → `master`(MCP 工具可见性 + autostart 幂等 + `shell_exec` 只读巡检白名单) |
| 已关闭 PR | #2(由 clean 分支取代, 无遗漏提交) |

### 9.2 复核实测结果

- **测试**: realmcore 225 · server 49 · warpmcp 11 · app 6 = **291 个测试全部通过**。
- **静态检查**: `npm run lint`(shared + realmcore)无告警; `tsc -p packages/app --noEmit` 退出码 0。
- **i18n**: `npm run i18n:check -w @warpcore/app` 通过, 14 命名空间 / 每语言 1,392 key。
- **CI**: HEAD 上 `CI` 与 `Windows MSI` 两个 workflow 均 success。

### 9.3 需要注意的事项

- **上游同步成本已进入重写级别**: `git merge-tree --write-tree` 演练显示合并 `upstream/master` 会产生 **220 个冲突路径**(app 153 · server 26 · warpmcp 12 · bridge 9 · shared 6 · realmcore 4)。其中 `landing/.astro/*` 与 `landing/original/chat.html` 是 modify/delete 冲突(本 fork 已把这两个目录 gitignore 并移出版本库, 上游仍在跟踪), 解决方式是保留删除。
- **autostart 修复存在双向改动**: 上游 `7d7fd23` 也改了 autostart 设置报错(`SettingsPage.tsx` / `store/slices/settings.ts` / `routes/settings.ts`), 本 fork 的方案是独立文件 `packages/app/src/utils/autostart.ts`(上游不存在)。同步时需逐一确认两边修复都不被覆盖。
- **i18n 仍是 fork 独有价值**: `upstream/master` 至今没有任何 locale 文件, zh-CN 层不会被上游重复实现。
- **`npm audit` 依赖官方 registry**: 若 npm registry 配置为镜像(如 `registry.npmmirror.com`), 其未实现 `/-/npm/v1/security/*` 接口, `npm audit` 会直接报错而非返回 0 漏洞; 复扫需临时切回官方 registry。

