# warpdrv / warpcore 代码安全审计报告

日期：2026-08（分支 `DETACHED`，v0.5.8）
范围：monorepo monorepo（server / bridge / app / bridge / realmcore / warpmcp / desktop），重点审计 server 端安全边界、鉴权、SSRF/路径穿越、命令执行与资源/并发。方法：代码知识图谱 + 逐文件审阅。

> 总体评价：这是一套**安全意识明显高于平均水平**的代码库——默认绑定回环、进程用数组形式 spawn、下载有 Zip-Slip/Tar-Slip 防护、token 走 bcrypt、recipe 走 `bash -c` 但做了元字符黑名单。下面按严重性列出可改进项；多数为加固/正确性问题，而非低级的注入漏洞。

---

## 高（Medium-High）

### A1. OpenAI 兼容代理默认对任意网站开放且响应可读（资源盗用 + 输出读取）
- `packages/server/src/services/modelProxy.ts:246`（内层 app 使用 `cors()` 无参 = `Access-Control-Allow-Origin: *`）+ 鉴权默认关闭（`proxyAuthEnabled:false`，见 `packages/shared/src/types.ts:384`）。
- 代理默认开启（`proxyEnabled:true`，`types.ts:383`），监听固定端口 `1234`（`modelProxy.ts:486`），且转发目标恒为 `127.0.0.1`（无 SSRF，见下）。
- 后果：用户访问的**任意网页**都可向 `http://127.0.0.1:1234/v1/models` 读取本机模型别名列表（因 ACAO:`*` 可读），并向 `/v1/chat/completions` 发推理请求、读取返回内容——消耗本地 GPU/算力，且可读取模型输出。
- 建议：默认 `cors()` 收紧为可信来源白名单；或在代理路径要求一个每会话 token；至少把默认端口随机化并在文档强调开启 `proxyAuthEnabled`。

### A2. 代理的“按模型/token 推理权限”形同虚设（越权）
- `packages/server/src/middleware/auth.ts:128`：`const model = req.body?.model;`，随后 `if (model && !hasInferenceAccessForToken(...))`。
- 但代理子应用**没有** `express.json()`（`modelProxy.ts` 全文无 body 解析，只有自定义 `_rawBody` 采集器，见 `modelProxy.ts:246-268`），因此 `req.body` 恒为 `undefined` → `model` 恒为 `undefined` → 该权限判断分支**永不执行**。
- 结果：即使开启 `proxyAuthEnabled`，只要携带任意有效 token（包括 `inference:false`、仅 MCP 权限的 token）也能通过 `proxyAuthMiddleware`（`auth.ts:116-140`）使用推理代理。token 的 `inference: string[]` 细粒度授权在代理路径上完全失效。
- 建议：在 `proxyAuthMiddleware` 之前解析出 model（复用 `_rawBody` JSON.parse，或对 multipart 用 `extractModelFromMultipart`），或在转发处（已 `JSON.parse(_rawBody)`）补做 `hasInferenceAccessForToken` 校验。

---

## 中（Medium）

### M1. 本地控制面无鉴权 + 无 CSRF 防护，仅靠 CORS 预检兜底
- 默认 localhost 免鉴权：`middleware/auth.ts:19-27,60-89`（`shouldRequireAuth` 对 localhost 返回 false）。未设置 `trust proxy`（好，`req.ip` 不可伪造），但控制面**完全没有 CSRF 令牌/Origin 校验**。
- 状态变更端点中，部分不要求 JSON body，可被“简单跨域请求”（form/text/plain POST，浏览器不发预检）触发：例如 `POST /api/recipes/:id/run` 对 body 无必填校验（`routes/recipes.ts:107-122`），`POST /api/proxy/stop`、`/start` 也无 body（`routes/proxy.ts:77-96`）。
- 实际可利用性受限：创建 recipe 需 JSON body（触发预检被拦）、recipe id 为随机 6-hex 且跨域不可读，故难以直接 RCE；但架构上把“可执行命令的本地控制面”暴露给浏览器、仅以 CORS+不可猜 id 作为唯一防线，属脆弱设计。
- 建议：对 `POST/PUT/DELETE` 增加同源校验或共享密钥头（如自定义 header），或默认开启 `authRequireForLocalhost`；至少让所有变更端点强制要求 `application/json`。

### M2. 可将 `apiHost` 设为非回环而不强制开启鉴权
- `routes/settings.ts:17-61,93-103`：`apiHost` 允许任意字符串、与 `apiAuthEnabled`/`authRequireForLocalhost` 无耦合校验。用户可把 API 绑到 `0.0.0.0` 且保持鉴权关闭，从而将整个控制面（含 recipe 执行）暴露到局域网。
- 注释（`shared/src/types.ts:377-378`）声称“先改 apiHost 再启用鉴权”，但代码未强制。
- 建议：当 `apiHost` 非回环且两个鉴权开关都关闭时，拒绝持久化或强提示；或在启动时若为非回环且无鉴权则告警并降级为仅推理。

### M3. recipe 执行依赖黑名单，且白名单常量未接线
- `packages/server/src/services/recipeRunner.ts:28` 定义了 `SAFE_COMMAND_PATTERN`（白名单）但**全文从未使用**；实际仅靠 `validateRecipeBody`（`recipeRunner.ts:470-477`）的黑名单。
- 黑名单存在缺口：如裸命令 `rm -rf ~`（无 `;|&&` 前缀时不匹配任何 rm 规则）、`bash -c` 语义下大量未列出的命令可绕过。由于 recipe 本身就是 `bash -c`，黑名单无法从根本上保证安全。
- 缓解现状：recipe 需 admin 才能创建/运行、且无内置 recipe、id 随机；故风险取决于“用户主动导入并运行恶意 recipe”。
- 建议：要么真正启用白名单（仅允许受信任命令族），要么在 UI/文档明确“导入的 recipe 等同于执行任意脚本”，并在运行前展示完整命令供确认。

### M4. `startGenericDownload` 不校验 filename/URL
- `services/downloadManager.ts:389-443`：与 HF 路径不同，未调用 `sanitizeDownloadPaths`；`sourceUrl`、`filename` 未校验即 `path.join(destDir, filename)`。
- 当前调用方（`routes/backends.ts:211`、`whisperBackends.ts:169`）传入的是受信任发布清单里的 `asset.url/filename`，且 admin 门控，故当前不可利用；属纵深防御缺失。
- 建议：对 `filename` 复用与 HF 相同的段校验（禁止绝对路径/`..`/空段）。

---

## 低（Low）

- **L1 代理转发泄露客户端 Authorization**：`modelProxy.ts:140` 的 `SAFE_PROXY_HEADERS` 含 `authorization`，会把 warpcore bearer token 透传给本地 llama-server。后端不需要它，建议从转发头中剔除。
- **L2 SSE 无并发上限**：`services/sseManager.ts:5,58-100` 会话数组无上限；长时间运行/大量连接会累积内存（本地应用影响小）。建议加最大连接数。
- **L3 store 全量同步写盘**：`util/store.ts:65-78` 每次 `put` 全量 `JSON.stringify` + 同步落盘；高频更新（如 server 状态、token）下有性能放大效应。可考虑去抖/批量写。
- **L4 代理 JSON 请求体先整体缓冲**：`modelProxy.ts:246-268` 为鉴权把整个请求体缓冲后才 `next()`；对大上下文请求增加内存占用（功能正确，属效率点）。
- **L5 死代码**：`modelProxy.ts` 的 `proxyRequest`、`extractModelFromMultipart` 疑似未被实际路由使用（catch-all 自行转发）；建议清理以免误导后续维护（其中一处若接回将触发 A2 的正确性问题）。

---

## 信息 / 良好实践（已确认到位）
- **无 SSRF**：代理转发目标恒为 `127.0.0.1` + 存储端口（`modelProxy.ts:143,296,338,397`），目标主机不可被请求方控制；HF 下载 URL 基址固定 `huggingface.co`（`routes/hub.ts:24`）。
- **无命令注入**：进程管理用数组形式 `spawn(binaryPath,args)`，无 shell（`processManager.ts:418`）；用户 extraArgs 经 `shell-quote` 仅做 tokenize 且只取字符串（`:377-382`），并把 `--host/--port/--slot-save-path` 置于其后防覆盖（`:374-394`）。
- **路径穿越防护到位**：checkpoint id 校验（`checkpointService.ts:62-76`）、Zip-Slip/Tar-Slip 用 `path.relative` 收敛（`postActions.ts:42-106`）、HF 下载段校验（`downloadManager.ts:31-51`）。
- **无任意文件读取路由**：routes 下无按用户路径 `sendFile/readFile`。
- **Token 存储规范**：bcrypt(10) + 32B 随机 + 前缀预筛避免全量 bcrypt（DoS 防护，`routes/tokens.ts:13,120-138`）；Cookie httpOnly + sameSite=strict（`routes/auth.ts:44-50`）。
- **前端 XSS 面小**：react-markdown 默认不渲染原始 HTML（全仓无 `rehype-raw`）；mermaid 输出经 DOMPurify 过滤后才注入（`mermaid-diagram.tsx:26-30`），且 `securityLevel:'strict'`（`ChatPage.tsx:131`）。
- **进程/定时器资源回收成熟**：spawn error/exit 均清理健康定时器、stats、端口与 map（`processManager.ts:471-499`）；限流器有分桶清理（`rateLimiter.ts:8-17`）。
- **自动更新仅返回版本信息**，服务端不下载/执行（`routes/update.ts`）——但请确认 Tauri 端 updater 的签名公钥已固定（本次未覆盖 desktop 侧）。

---

## 建议修复优先级
1. A2（代理越权，改动小、影响明确）→ 在转发处补 `hasInferenceAccessForToken`。
2. A1（代理 CORS/默认鉴权）→ 收紧 CORS 或每会话 token。
3. M1/M2（本地控制面 CSRF + apiHost 强制鉴权）。
4. M3/M4（recipe 白名单接线、generic download 校验）。

---

## 修复状态（本次已实施，`tsc --noEmit` 通过）

| 项 | 状态 | 改动 |
|----|------|------|
| A1 代理 CORS `*` | ✅ 已修 | `modelProxy.ts`：`cors()` 改为仅放行无 Origin（非浏览器客户端）+ localhost/tauri/wry 来源；随机网站无法再读取/驱动本地代理。 |
| A2 代理按 token 推理权限失效 | ✅ 已修 | `middleware/auth.ts`：`proxyAuthMiddleware` 从 `_rawBody` 解析 model，使 `hasInferenceAccessForToken` 真正生效；`modelProxy.ts` multipart 转写路由在提取 model 后用 `authToken` 补做校验。 |
| M1 本地控制面 CSRF | ✅ 已实施 | `index.ts`：新增 `/api` CSRF 中间件——拒绝携带非本地/桌面 Origin 的跨域状态变更请求；无 Origin 的非浏览器客户端放行。 |
| M2 非回环绑定不强制鉴权 | ✅ 已修 | `routes/settings.ts`：PUT 时若 `apiHost`/`proxyHost` 为非回环且对应鉴权关闭则返回 400 拒绝持久化。 |
| M3 recipe 白名单死代码 | ✅ 已处理 | `recipeRunner.ts`：移除误导性的未使用 `SAFE_COMMAND_PATTERN`，补充威胁模型注释（真正控制为 admin 门控 + 用户审阅）。深度方案（硬白名单/运行前确认 UI）属产品决策。 |
| M4 generic download 校验 | ✅ 已修 | `downloadManager.ts`：`startGenericDownload` 增加 http(s) URL 与 filename 段校验（禁绝对路径/`..`/空段）。 |
| L1 透传 authorization | ✅ 已修 | `modelProxy.ts`：转发头白名单移除 `authorization`（及 origin/referer），不再把 bearer token 泄露给本地后端。 |

未改动（低危，建议后续）：L2 SSE 并发上限、L3 store 全量同步写盘、L4 代理请求体缓冲、L5 死代码清理（`proxyRequest`/`extractModelFromMultipart`）。desktop 侧 Tauri updater 签名公钥固定情况本次未覆盖，需另行确认。
