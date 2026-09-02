# llama-server 参数基线核验报告（warpdrv × llama.cpp v0.3.0）

- **日期**：2026-09-02
- **官方基线**：llama.cpp **v0.3.0**（2026-08-25 发布，`ggml-org/llama.cpp` 最新 release；参数表取自该 tag 的 `tools/server/README.md`，105 KB / 1666 行）
- **warpdrv 基线**：代码侧提取（`processManager.ts` 的 buildArgs/buildSpecDecodeArgs{Legacy,Modern}/stripControlledDefaultArgs、`shared/flagMappings.ts`、`shared/types.ts` ILaunchParams/ISpecDecodeParams、`bridge/inferenceParams.ts` API 采样层、SpeculativeDecodingCard/OptionsCard 等 UI）
- **官方标记总数**：331 个 `--flag` 标记（含 `--no-*` 否定形式与文档中的新旧别名）

---

## 1. 总览结论

**warpdrv 的参数基线总体健康，核心面覆盖良好**，并且有一套官方都没有的跨版本能力探测机制（`supportedFlags` 白名单 + `pushSupportedOption` 别名族回退 + legacy/modern 双路径），在多版本 llama.cpp 后端混用场景下比硬编码参数表更稳。

主要差距集中在三个方向：

1. **草稿模型（spec-draft-*）的"运维面"缺失**：warpdrv 覆盖了 model/ngl/device/n-max/n-min/p-min，但官方 v0.3.0 已扩展到 CPU offload 控制（`--spec-draft-cpu-*`）、线程/优先级/轮询（`--spec-draft-threads/prio/poll`）、草稿 KV 量化（`--cache-type-k-draft/-v-draft`）等约 20 个参数。
2. **官方新特性未跟进**：lookup cache（`--lookup-cache-static/dynamic`）、提示相似度 KV 复用（`--slot-prompt-similarity`）、采样后端（`--backend-sampling`）、LoRA（`--lora*`）、推理保留（`--reasoning-preserve`）、mmproj 远程加载（`--mmproj-url/auto/offload`）等。
3. **低价值/职责重叠面**（不建议对齐）：官方 web UI/MCP servers、模型注册表（models-*）、CORS/SSL/api-key（warpdrv 代理层自管）、日志/调试类、Docker 构建类。

---

## 2. 已覆盖良好（无需动作）

| 域 | warpdrv 现状 |
|---|---|
| 模型加载 | `-m`、`-ngl/--gpu-layers/--n-gpu-layers`、`--load-mode` + 旧 `--mmap/--mlock/--no-mmap/--direct-io` 兼容翻译、`--device`、`--main-gpu`、`-ts/-sm`（tensor-split/split-mode）、`--mmproj` |
| 上下文/批处理 | `-c`、`-b`、`-ub`、`-t`、`-tb`、`-np`（parallel）、`--kv-unified`、`--cache-type-k/v`、`--swa-full`、`--chat-template`、`--chat-template-kwargs`（preserve_thinking）、`--jinja`、`--no-warmup`、`--embedding`、`-fa/--flash-attn`（on/off/auto + 能力探测） |
| 投机解码 | `--spec-type` 全枚举（ESpecType 含 ngram-simple/cache/map-k/map-k4v/mod、draft-simple/eagle3/dspark、draft-mtp、draft-dflash）；ngram 各变体按 `--spec-ngram-<prefix>-size-n/m/min-hits`、mod 的 `n-match/n-min/n-max` 映射；MTP/DFLASH 的 `--spec-draft-n-max/min`、`--spec-draft-model/-ngl/-device/-p-min`；旧 `--model-draft/--gpu-layers-draft/--device-draft` 回退 |
| 采样（API 层） | bridge 归一化 40+ 参数：temperature/top_p/top_k/min_p/typical_p/repeat_penalty/last_n/seed/mirostat*/dynatemp*/xtc*/dry*(除 sequence_breaker)/top_n_sigma/logit_bias/grammar/json_schema/samplers/reasoning_*/stop 等（llama-server 采样走 OpenAI 兼容 API 而非 CLI，这是正确用法） |
| 端口/主机/安全 | `--host/--port` 由 inferenceExposeExternal 控制（默认回环）✓ |
| KV 检查点 | `--slot-save-path`（warpdrv 自管检查点流程） |
| 能力兼容 | backendValidator 解析 `--help` 输出，spec 新旧两套参数 + REMOVED_SPEC_FLAGS 清理 + loadMode/flashAttn 降级链——官方无此机制 |

---

## 3. 差异清单

### A. 建议对齐（P1，官方新增且价值高）

| # | 官方参数 | 说明 | warpdrv 现状 |
|---|---|---|---|
| 1 | `--cache-type-k-draft` / `--cache-type-v-draft` | 草稿模型 KV 量化（小内存草稿模型可进一步压缩） | ❌ 缺失 |
| 2 | `--spec-draft-cpu-mask / -batch / --spec-draft-cpu-strict / -batch / --spec-draft-cpu-moe / --spec-draft-cpu-range / --spec-draft-ncmoe` | 草稿模型的 CPU 卸载控制（大目标+小草稿场景常用，尤其统一内存/多 GPU 用户） | ❌ 缺失 |
| 3 | `--spec-draft-threads / --spec-draft-threads-batch / --spec-draft-poll / -batch / --spec-draft-prio / -batch` | 草稿模型线程/轮询/优先级 | ❌ 缺失 |
| 4 | `--lookup-cache-static / --lookup-cache-dynamic` | 新投机机制（KV lookup cache），配合 ngram 类使用 | ❌ 缺失 |
| 5 | `--slot-prompt-similarity` | 跨请求提示相似度复用 KV（替代部分 --cache-prompt 场景） | ❌ 缺失 |
| 6 | `--dry-sequence-breaker` | DRY 的序列断点串（warpdrv 有 dry_multiplier/base/allowed_length/penalty_last_n 四个，缺此一个） | ❌ 缺失（API 层） |
| 7 | `--reasoning-preserve / --no-reasoning-preserve` | 保留/剥离推理块（与 preserve_thinking 同族，官方新加） | ❌ 缺失（warpdrv 用 chat-template-kwargs preserve_thinking，旧机制） |
| 8 | `--mmproj-url / --mmproj-auto / --no-mmproj-auto / --mmproj-device / --mmproj-offload / --no-mmproj-offload / --media-path` | 多模态投影加载演进：URL 自动下载、自动探测、设备指定、offload 控制 | ❌ 缺失（仅本地 `--mmproj` + UI 文件选择） |
| 9 | `--lora / --lora-scaled / --lora-init-without-apply` | LoRA 适配器（单基座多适配器，社区高频需求） | ❌ 缺失 |
| 10 | `--backend-sampling / --no-backend-sampling` | 新采样后端（llama-sampling）开关；`--sampling-seq` 采样器顺序 | ❌ 缺失 |
| 11 | `--spec-draft-override-tensor / --spec-draft-hf` | 草稿模型张量覆盖 / HF 直接加载草稿 | ❌ 缺失（低概率用，可并入 2-3 批） |

### B. 中等价值（P2，按需对齐）

- `--ctx-checkpoints / --checkpoint-min-step`：官方**自动**上下文检查点（与 warpdrv 的 `--slot-save-path` 手动检查点是不同机制）；warpdrv 检查点流程成熟，可评估是否让位给官方自动版。
- `--cache-reuse`：KV 跨请求复用；`--cache-idle-slots/--no-cache-idle-slots` 空闲槽缓存。
- `--control-vector / --control-vector-scaled / --control-vector-layer-range`：控制向量（角色/风格注入）。
- `--rpc`：跨机分布式推理（价值高但属重量级特性，需 backend 管理配套）。
- `--top-nsigma`（官方新拼写，旧 `--top-n-sigma` 仍在）：warpdrv API 层已用 `top_n_sigma`，无实际差距，仅记录。
- N-gram 变体 UI 暴露：ESpecType 与 modern 参数构建已支持 map-k/k4v/simple/cache，但 SpeculativeDecodingCard 的 UI 未暴露变体选择（当前 UI 只到 ngram/mod 三值 N-Match/N-Min/N-Max）——**属于 UI 接线缺口而非参数层缺口**。
- `--keep`（n-keep）、`--timeout`、`--sse-ping-interval`、`--threads-http`：服务运维微调项。
- `--grammar-file / --json-schema-file / --chat-template-file`：文件形态变体（warpdrv 支持内联形态）。

### C. 低价值/职责重叠（P3，不建议对齐）

- **官方 Web UI / MCP**：`--ui/--webui/--no-ui/--no-webui`、`--mcp-servers-*`、`--tools/--tools-runtime`——warpdrv 有自研 UI 与内置 MCP（warpmcp），重叠。
- **模型注册表**：`--models-autoload/dir/max/preset`、`--config`、`--props`——warpdrv 自己管理模型库与推荐参数。
- **认证/TLS/CORS**：`--api-key/--api-key-file`、`--ssl-*`、`--cors-*`——warpdrv 代理层自管且 llama-server 默认回环绑定。
- **下载/构建/调试**：`--hf-repo/file/token`、`--model-url`、`--docker-repo`、`--build`、`--offline`、`--log-*`、`--verbosity/--verbose`、`--metrics`（warpdrv 有 statsPoller）、`--no-perf`。
- **实验/模板预设**：`--fim-qwen-*`、`--gpt-oss-*`、`--vision-gemma-*`、`--embd-gemma-default`（等价于 --chat-template 自填）、`--agent/--no-agent`、`--escape`、`--special`、`--tags`、`--spm-infill`、`--prefill-assistant`、`--skip-chat-parsing`、`--repack`、`--poll`、`--no-context-shift/--cont-batching`（官方默认已 context shift）、`--check-tensors`、`--op-offload`、`--cpu-mask/-strict/-moe/-range`、`--numa`、`--fit/-ctx/-target`、`--override-kv/tensor`、`--rerank/--reranking`、`--pooling`、`--image-min/max-tokens`、`--mtmd-batch-max-tokens`、`--usage`、`--reuse-port`、`--api-prefix/--path`、`--warmup`、`--keep` 部分。

### D. warpdrv 侧旧 flag 状态（已正确处理）

| warpdrv 处理 | 状态 |
|---|---|
| `--ctx-size-draft` | 官方 v0.3.0 已移除该 flag；warpdrv 标注 legacy 且仅在 capabilities 确认存在时发射 ✓ |
| `--draft / --draft-n / --draft-max / --draft-min / --draft-n-min / --draft-p-min` | 官方文档仍列（废弃别名）；warpdrv legacy 路径保留、modern 路径转 `--spec-draft-*`，且 REMOVED_SPEC_FLAGS_WITH_VALUE 在 modern 后端上剥除 ✓ |
| `--spec-ngram-size-n/m/min-hits`（旧 ngram） | 官方仍兼容；warpdrv 仅 legacy 路径发射 ✓ |
| `-ngl/-ts/-sm/-mg/-c/-b/-ub/-t/-tb` 短旗标 | 官方 v0.3.0 全部仍有效 ✓ |

---

## 4. 建议与实施路径

**总体建议：分三批对齐 A 类，B 类按需求取用，C 类不动。**

| 批次 | 内容 | 成本 | 收益 |
|---|---|---|---|
| 1 | `--cache-type-k-draft/-v-draft`、`--dry-sequence-breaker`（API 层）、`--reasoning-preserve`、`--backend-sampling` 开关 | 小（类型 + 参数映射 + i18n + 测试） | 高频可用 |
| 2 | spec-draft CPU/线程族（约 12 个参数，UI 放"高级"折叠区）+ `--lookup-cache-*` + `--slot-prompt-similarity` | 中（ISpecDecodeParams 扩展 + SpeculativeDecodingCard 新分区 + capabilities 探测） | 多 GPU/大模型用户核心诉求 |
| 3 | `--lora*`（BackendDialog/Launch UI 新增 LoRA 选择器 + 参数） | 中 | 社区高频 |
| 4（可选） | `--mmproj-url/auto/offload`（多模态下载自动化）；ngram 变体 UI 暴露 | 中 | 多模态/ngram 用户 |

**实施路径（与现有机制一致）**：`shared/types.ts` 加字段 → `bridge/inferenceParams.ts`（API 层参数）或 `processManager.ts`（CLI 层参数）→ 能力探测白名单/别名族 → UI 卡 + 两语言 i18n key → `server/tests/buildArgs.test.ts` 风格回归测试（现有 26 用例已锁定 -ts/-ngl/--host 注入等，新参数同样加用例）。

**版本策略提示**：参数按 capabilities 探测发射的机制已证明有效，新增参数务必走 `pushSupportedOption`/`acceptedSpecType` 而不是无条件发射，以保持对旧后端（用户自编译 llama.cpp）的兼容。

---

## 5. 附录

- 官方 v0.3.0 全部 331 个 flag 标记见同目录 `llama-cpp-v0.3.0-flags.txt`。
- warpdrv 侧提取证据：`packages/server/src/services/processManager.ts:130-228, 304-370`、`packages/shared/src/flagMappings.ts`、`packages/shared/src/types.ts:146-217`、`packages/bridge/src/orchestrator/inferenceParams.ts`。
- 范围外：whisper.cpp 侧参数（`whisperProcessManager.ts` 的 --no-gpu/--flash-attn/--translate/--prompt/--convert/--inference-path）未纳入本次核验，如需同样核验可另行安排。
