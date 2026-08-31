# warpdrv-i18n（warpcore）架构概览

> 本文档由 codebase-memory 知识图谱（7,879 节点 / 22,700 边，生成于 2026-08-29）自动分析整理。
> 模块**角色**为基于命名与依赖方向的推断；调用/依赖数据来自静态图，可能不含动态派发。

## 一句话定性

一个 **TypeScript monorepo 形态的本地大模型运行 / 管理平台**：React Web 前端 + HTTP 后端 + 一个作为编排核心的 MCP bridge，负责模型扫描/下载、拉起 llama.cpp 类推理服务、MCP 工具桥接与对话（含 TTS / Whisper）。

## 技术栈 & 规模

- **语言**：TypeScript 417 文件为绝对主体；Rust 2（`realmcore` 原生核心）；SCSS/CSS 31（样式）；YAML/Bash/TOML 少量脚本与配置。
- **结构**：pnpm workspace monorepo，`packages/*` + `tools/` + `landing/`（落地页）。

## 包 / 模块地图（按图谱节点数排序）

| 包 | 节点 | 角色（推断） |
|---|---:|---|
| **app** | 1189 | React Web 前端：Chat、Hub、Backends、Settings、Proxy、Checkpoints 等页面 + `api/` HTTP 客户端层 |
| **server** | 444 | 后端 HTTP API：模型 scan / cache / download、拉起推理服务 |
| **bridge** | 318 | **编排核心**：MCP 桥接、elicitation 注册表、spawnServer / proxy / killServer |
| **shared** | 195 | 跨包共享类型与工具 |
| **realmcore** | 129 | Rust 原生核心（解析 / ingest / GGUF 相关） |
| **warpmcp** | 81 | warp 的 MCP server |
| **desktop** | 20 | 桌面壳（Tauri，见 `binaries/`、`target/`） |

## 分层与依赖方向

```
        app (前端, fan-out 42)          server (后端, fan-out 37)
              │   ╲                          │   ╱
              │    ╲ app→bridge 37           │  ╱ server→bridge 23
              ▼     ╲                        ▼ ╱
            ┌─────────────────────────────────────┐
            │   bridge   ★ CORE (fan-in 67, out 0) │   ← 被依赖最多的稳定核心
            ├─────────────────────────────────────┤
            │   realmcore  core (in 9 / out 5)     │
            └─────────────────────────────────────┘
```

跨包调用 Top：`app→bridge` 37 · `server→bridge` 23 · `server→app` 8 · `app→realmcore` 5。

**关键结论**：`bridge` 是 fan-in 最高、fan-out 为 0 的**依赖汇聚点（核心层）**——前后端都依赖它，它不反向依赖别人。改 `bridge` 的影响半径最大，需最谨慎。

## 热点（被引用最多的符号）

| 符号 | fan-in | 说明 |
|---|---:|---|
| `app.lib.utils.cn` | 46 | className 合并工具（前端基础设施） |
| `bridge.mcp.ElicitationRegistry.resolve` | 32 | MCP elicitation 解析核心 |
| `server.util.store.put` | 32 | 后端持久化写入 |
| `app.ToastProvider.toast / useToast` | 27 / 22 | 前端通知系统 |
| `api.client.del / getList`、`mcpServices.json` | ~19–20 | HTTP 客户端通用封装 |

## 功能簇（社区检测出的事实模块）

- **Shell / 路径安全**（cohesion 0.93）：`assertPathAllowed · validateShellCommand · shellExecHandler` —— 命令执行的安全校验层。
- **SSE / 路由 pub-sub**（0.98）：`route · listen · sub/pub · computeTargetAddr` —— 事件分发总线。
- **Checkpoint / Spec-Decode**（0.90）：`saveCheckpoint · restoreCheckpoint · buildSpecDecodeArgsModern` —— 推理参数快照。
- **Hub 下载编排**：`launchServer · scanAllModelRoots · registerSSEChannels` —— 模型扫描与下载流水线。
- **TTS / 流式对话**：`handleEvent · startStream · stopTTS · loadThread`。
- **解析 / ingest**（realmcore）：`extractDeclarations · parseFile · reparseFile · ingest · createParser`。

## HTTP API 面（路由）

- **模型中心**：`GET /hub/model/{}/{}`、`POST /hub/download`、`/hub/downloads/{}/pause|resume|cancel`、`/hub/downloads/history`、`/hub/model/.../recommended-params`
- **运行时资产与服务管理**：`POST /scan`、`GET /scan-status`、`GET /cache`、`ANY /onnxruntime`、`ANY /vad`、`/models/*.gguf`

## 观察与潜在关注点

1. **bridge 是单点核心**：0 fan-out + 最高 fan-in，稳定性好但改动 blast radius 大——建议优先补测试与 ADR。
2. **安全簇值得重点审视**：存在 shell exec / 路径校验逻辑（`validateShellCommand`、`assertPathAllowed`），属高价值审计面。
3. `app` 体量最大且混合了页面 + api 客户端，可关注前端分层是否清晰。

---
*维护建议：代码结构发生显著变化后，重新运行 codebase-memory 索引并更新本文档；与 `manage_adr` 存储的结构化 ADR 保持同步（ADR 记录决策理由，本文记录结构事实）。*
