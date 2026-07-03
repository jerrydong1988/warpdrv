# warpdrv i18n 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 warpdrv 添加 i18n 国际化支持，首期实现 en（源语言）+ zh-CN（简体中文）。

**架构：** 使用 react-i18next + i18next 作为 i18n 框架，Zustand + localStorage 持久化语言偏好，服务端采用错误码 + 客户端映射表方案。翻译文件按 namespace 分模块管理。

**技术栈：** React 19 + TypeScript + Chakra UI v3 + Zustand v5 + i18next + react-i18next + i18next-parser

---

## 全局文件结构

```
packages/app/src/
├── i18n/
│   ├── index.ts                           # [创建] i18next 初始化
│   └── locales/
│       ├── en/                            # [创建] 英文源语言
│       │   ├── common.json
│       │   ├── settings.json
│       │   ├── ... (14 个 namespace)
│       └── zh-CN/                         # [创建] 简体中文
│           ├── common.json
│           └── ... (14 个 namespace)
├── store/
│   └── slices/
│       └── settings.ts                    # [修改] 新增 locale 字段
├── App.tsx                                # [修改] 挂载 I18nProvider
├── main.tsx                               # [修改] 包裹 I18nProvider
├── i18next-parser.config.ts               # [创建] parser 配置
└── pages/**, components/**                # [修改] 替换硬编码为 t() 调用

packages/shared/src/
└── i18n-errors.ts                         # [创建] 服务端错误码枚举

packages/server/src/routes/
└── **/*.ts                                # [修改] 错误消息改为错误码格式

packages/app/src/api/
└── client.ts                              # [修改] 新增错误码拦截器
```

---

### 任务 1：安装依赖

**文件：**
- 修改：`packages/app/package.json`

- [ ] **步骤 1：安装 i18next + react-i18next + i18next-parser**

```bash
npm install i18next react-i18next -w @warpcore/app
npm install -D i18next-parser -w @warpcore/app
```

预期：依赖添加到 `packages/app/package.json`

- [ ] **步骤 2：验证安装**

```bash
npm ls i18next react-i18next
```

预期：显示已安装的三个包及版本

---

### 任务 2：创建 i18next 初始化模块

**文件：**
- 创建：`packages/app/src/i18n/index.ts`

- [ ] **步骤 1：编写 i18next 配置**

```typescript
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from './locales/en/common.json';
import settingsEn from './locales/en/settings.json';
import chatEn from './locales/en/chat.json';
import onboardingEn from './locales/en/onboarding.json';
import homeEn from './locales/en/home.json';
import serversEn from './locales/en/servers.json';
import backendsEn from './locales/en/backends.json';
import modelsEn from './locales/en/models.json';
import hubEn from './locales/en/hub.json';
import mcpEn from './locales/en/mcp.json';
import recipesEn from './locales/en/recipes.json';
import checkpointsEn from './locales/en/checkpoints.json';
import proxyEn from './locales/en/proxy.json';
import aboutEn from './locales/en/about.json';

import commonZhCN from './locales/zh-CN/common.json';
import settingsZhCN from './locales/zh-CN/settings.json';
import chatZhCN from './locales/zh-CN/chat.json';
import onboardingZhCN from './locales/zh-CN/onboarding.json';
import homeZhCN from './locales/zh-CN/home.json';
import serversZhCN from './locales/zh-CN/servers.json';
import backendsZhCN from './locales/zh-CN/backends.json';
import modelsZhCN from './locales/zh-CN/models.json';
import hubZhCN from './locales/zh-CN/hub.json';
import mcpZhCN from './locales/zh-CN/mcp.json';
import recipesZhCN from './locales/zh-CN/recipes.json';
import checkpointsZhCN from './locales/zh-CN/checkpoints.json';
import proxyZhCN from './locales/zh-CN/proxy.json';
import aboutZhCN from './locales/zh-CN/about.json';

type SupportedLocale = 'en' | 'zh-CN';

const resources: Record<SupportedLocale, Record<string, object>> = {
  en: {
    common: commonEn,
    settings: settingsEn,
    chat: chatEn,
    onboarding: onboardingEn,
    home: homeEn,
    servers: serversEn,
    backends: backendsEn,
    models: modelsEn,
    hub: hubEn,
    mcp: mcpEn,
    recipes: recipesEn,
    checkpoints: checkpointsEn,
    proxy: proxyEn,
    about: aboutEn,
  },
  'zh-CN': {
    common: commonZhCN,
    settings: settingsZhCN,
    chat: chatZhCN,
    onboarding: onboardingZhCN,
    home: homeZhCN,
    servers: serversZhCN,
    backends: backendsZhCN,
    models: modelsZhCN,
    hub: hubZhCN,
    mcp: mcpZhCN,
    recipes: recipesZhCN,
    checkpoints: checkpointsZhCN,
    proxy: proxyZhCN,
    about: aboutZhCN,
  },
};

export const NAMESPACES = [
  'common',
  'settings',
  'chat',
  'onboarding',
  'home',
  'servers',
  'backends',
  'models',
  'hub',
  'mcp',
  'recipes',
  'checkpoints',
  'proxy',
  'about',
] as const;

export { type SupportedLocale };

export async function initI18n(locale: SupportedLocale = 'en'): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: NAMESPACES as unknown as string[],
    interpolation: {
      escapeValue: false,
    },
  });
}
```

- [ ] **步骤 2：执行 TypeScript 检查确认无编译错误**

```bash
npx tsc --noEmit -p packages/app/tsconfig.json
```

预期：当前会报缺少 JSON 文件的导入错误（下一步创建 JSON 文件后解决）

---

### 任务 3：创建 Parser 配置

**文件：**
- 创建：`packages/app/i18next-parser.config.ts`

- [ ] **步骤 1：编写 parser 配置**

```typescript
import { defineConfig } from 'i18next-parser/config';

export default defineConfig({
  input: ['src/**/*.{ts,tsx}'],
  output: 'src/i18n/locales/$LOCALE/$NAMESPACE.json',
  locales: ['en', 'zh-CN'],
  defaultNamespace: 'common',
  namespaceFunction: 'useTranslation',
  keySeparator: '.',
  createOldCatalogs: false,
  sort: true,
  defaultValue: (_locale, _namespace, _key, value) => value,
  keepRemoved: false,
  lineEnding: 'lf',
});
```

- [ ] **步骤 2：在 `packages/app/package.json` 添加 extract script**

在 `scripts` 中添加：
```json
"i18n:extract": "i18next-parser"
```

---

### 任务 4：创建 Zod Schema 用于自动提取 + 第一轮提取

**文件：**
- 创建：`packages/app/src/i18n/locales/en/common.json`（及其他 13 个 en/*.json）
- 创建：`packages/app/src/i18n/locales/zh-CN/*.json`（14 个文件，初始内容为 en 副本）

- [ ] **步骤 1：运行自动化提取脚本扫描所有硬编码字符串**

先确认目录存在：
```bash
New-Item -ItemType Directory -Force -Path packages/app/src/i18n/locales/en, packages/app/src/i18n/locales/zh-CN
```

然后执行字符串扫描（使用 ripgrep 提取 JSX 文本 + 属性字符串）：

```bash
rg -o --no-filename -g '*.tsx' -g '*.ts' "toast\.(error|success|info|warning)\(['\"]([^'\"]+)['\"]" packages/app/src -r '$2' | Sort-Object -Unique
```

```bash
rg -o --no-filename -g '*.tsx' "label=['\"]([^'\"]+)['\"]" packages/app/src -r '$1' | Sort-Object -Unique
```

```bash
rg -o --no-filename -g '*.tsx' "title=['\"]([^'\"]+)['\"]" packages/app/src -r '$1' | Sort-Object -Unique
```

```bash
rg -o --no-filename -g '*.tsx' "placeholder=['\"]([^'\"]+)['\"]" packages/app/src -r '$1' | Sort-Object -Unique
```

```bash
rg -o --no-filename -g '*.tsx' ">(<[^>]+>)*([A-Z][a-zA-Z][^<]{2,})</" packages/app/src -r '$2' | Sort-Object -Unique
```

- [ ] **步骤 2：整理输出到临时汇总文件 `strings-dump.txt`**

将所有去重后的字符串汇总到一个文件中，按来源文件分组标注。

- [ ] **步骤 3：根据 namespace 规则将字符串分配到各 JSON 文件**

按照设计文档中的 namespace 分配规则：
- 文件路径包含 `Settings` → `settings.json`
- 文件路径包含 `Chat` → `chat.json`
- 文件路径包含 `Onboarding` → `onboarding.json`
- ... 依此类推
- 剩余 `components/`、`hooks/`、`api/` 下的 → `common.json`

每个 JSON 文件以空对象 `{}` 初始创建。

---

### 任务 5：创建英文翻译 JSON（第一阶段 — 填充所有 namespace）

**文件：**
- 修改：`packages/app/src/i18n/locales/en/common.json` 等 14 个文件

- [ ] **步骤 1：逐个 namespace 填充 JSON**

以 `common.json` 为例，按 key 命名规范构造：

```json
{
  "navigation": {
    "home": "Home",
    "servers": "Servers",
    "router": "Router",
    "checkpoints": "Checkpoints",
    "backends": "Backends",
    "recipes": "Recipes",
    "models": "Models",
    "hub": "Hub",
    "mcp": "MCP",
    "chat": "Chat",
    "settings": "Settings",
    "about": "About"
  },
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "back": "Back",
    "next": "Next",
    "skip": "Skip",
    "close": "Close",
    "confirm": "Confirm",
    "copy": "Copy",
    "done": "Done",
    "previous": "Previous",
    "download": "Download"
  },
  "status": {
    "pending": "Pending",
    "running": "Running",
    "ok": "OK",
    "failed": "Failed",
    "cancelled": "Cancelled",
    "skipped": "Skipped",
    "completed": "Completed",
    "downloading": "Downloading",
    "paused": "Paused",
    "online": "Online",
    "offline": "Offline"
  },
  "toast": {
    "settingsSaved": "Settings saved",
    "loginSuccess": "Logged in successfully",
    "loginFailed": "Login failed",
    "scanFailed": "Scan failed",
    "deleteFailed": "Delete failed",
    "renameFailed": "Rename failed",
    "searchFailed": "Search failed",
    "downloadFailed": "Download failed",
    "saveFailed": "Save failed",
    "serverStartFailed": "Failed to start server",
    "serverLaunchFailed": "Failed to launch server",
    "backendSaveFailed": "Failed to save backend",
    "microphoneGranted": "Microphone access granted",
    "microphoneDenied": "Microphone access denied",
    "checkpointDeleted": "Checkpoint deleted",
    "renamed": "Renamed",
    "backendAdded": "Backend added",
    "backendUpdated": "Backend updated",
    "serverLaunched": "Server launched",
    "serverRelaunched": "Server relaunched",
    "serverConfigSaved": "Server config saved",
    "downloading": "Downloading ...",
    "tokenUpdated": "Token updated",
    "updateFailed": "Failed to update",
    "downloadHistoryCleared": "Download history cleared",
    "toolAlwaysApproved": "\"{{toolName}}\" will always be approved on current thread",
    "directoryPickerNotSupported": "Directory picker not supported in this environment",
    "tokenNameRequired": "Token name is required",
    "selectWhisperBackend": "Select a whisper backend",
    "selectModelFile": "Select a model file",
    "checkpointIncompatible": "Checkpoint incompatible with target server"
  },
  "fields": {
    "name": "Name",
    "creationDate": "Creation date",
    "updateDate": "Update date",
    "size": "Size",
    "slot": "Slot",
    "model": "Model",
    "user": "User",
    "quant": "Quant",
    "vision": "Vision",
    "params": "Params",
    "context": "Context",
    "files": "Files",
    "downloads": "Downloads",
    "likes": "Likes",
    "lastModified": "Last Modified",
    "createdDate": "Created Date"
  },
  "update": {
    "available": "WarpCore v{{version}} is available",
    "download": "Download"
  },
  "modelNotFound": "Model Not Found!",
  "noMCPConfig": "No MCP servers configured. Click + to add one, or edit the JSON directly.",
  "login": {
    "title": "WarpCore",
    "description": "Enter your access token to continue",
    "button": "Login",
    "loggingIn": "Logging in...",
    "help": "Contact your WarpCore admin to get an access token"
  },
  "errors": {
    "THREAD_NOT_FOUND": "Thread not found",
    "MESSAGE_NOT_FOUND": "Message not found",
    "SERVER_NOT_FOUND": "Server not found",
    "BACKEND_NOT_FOUND": "Backend not found",
    "BACKEND_GROUP_NOT_FOUND": "Backend group not found",
    "WHISPER_SERVER_NOT_FOUND": "Whisper server not found",
    "WHISPER_BACKEND_NOT_FOUND": "Whisper backend not found",
    "CHECKPOINT_NOT_FOUND": "Checkpoint not found",
    "RECIPE_NOT_FOUND": "Recipe not found",
    "MODEL_NOT_FOUND": "Model not found",
    "PRESET_NOT_FOUND": "Preset not found",
    "ELICITATION_NOT_FOUND": "Elicitation not found or already resolved",
    "NAME_AND_PATH_REQUIRED": "Name and path are required",
    "NAME_REQUIRED": "Name is required",
    "MISSING_REQUIRED_FIELDS": "Missing required fields",
    "MISSING_PARTS_ARRAY": "Missing parts array",
    "MISSING_UPDATES_ARRAY": "Missing updates array",
    "INVALID_CONFIG": "Invalid config",
    "MISSING_SERVER_NAME": "Missing server name",
    "TOPIC_REQUIRED": "Topic is required",
    "INVALID_OR_MISSING_MODE": "Invalid or missing mode",
    "THREAD_ID_REQUIRED": "Thread ID is required for thread mode",
    "SERVER_ID_REQUIRED": "Server ID is required",
    "INVALID_TOKEN": "Invalid token",
    "NOT_AUTHENTICATED": "Not authenticated",
    "TOKEN_NOT_FOUND": "Token not found",
    "SERVER_NOT_RUNNING": "Server not running",
    "BUILTIN_RECIPES_READONLY": "Built-in recipes are read-only",
    "RECIPE_RUN_IN_PROGRESS": "A recipe run is already in progress",
    "ACTIVE_BACKEND_MUST_BE_IN_GROUP": "Active backend must be in the group",
    "AT_LEAST_ONE_BACKEND_REQUIRED": "At least one backend is required",
    "BACKEND_NOT_IN_GROUP": "Backend not in group",
    "WHISPER_SERVER_NOT_RUNNING": "Whisper server not running",
    "WHISPER_UPSTREAM_ERROR": "Whisper upstream error",
    "DESTINATION_NOT_MODEL_DIR": "Destination is not a configured model directory",
    "KOKORO_NOT_READY": "Kokoro not ready",
    "INVALID_DECISION": "Invalid decision",
    "MISSING_THREAD_OR_SERVER_ID": "Missing thread ID or server ID",
    "UPDATE_CHECK_FAILED": "Failed to check for updates",
    "NO_MODEL_DIRECTORIES": "No model directories configured",
    "NO_ACTIVE_COMPLETION": "No active completion"
  }
}
```

- [ ] **步骤 2：填充 `settings.json`**

```json
{
  "title": "Settings",
  "subtitle": "WarpCore configuration",
  "sections": {
    "theme": "Theme",
    "appearance": "Appearance",
    "appZoom": "App Zoom",
    "chatFontSize": "Chat Font Size",
    "chatFontFamily": "Chat Font Family",
    "fixedChatWidth": "Fixed Chat Width",
    "modelDirectories": "Model Directories",
    "portRange": "Port Range",
    "checkpoints": "Checkpoints",
    "generateTitles": "Generate conversation titles",
    "voiceInput": "Voice Input",
    "voiceOutput": "Voice Output",
    "dictation": "Dictation",
    "globalPTT": "Global PTT",
    "apiHost": "API Host",
    "builtinMcp": "Built-in MCP Server (warpmcp)",
    "router": "Router",
    "launchOnStartup": "Launch on Startup",
    "startMinimized": "Start Minimized",
    "onboarding": "Onboarding",
    "language": "Language"
  },
  "descriptions": {
    "appearance": "UI appearance theme",
    "zoom": "App zoom and chat message styling",
    "modelDirs": "Folders to scan for GGUF models"
  },
  "themes": {
    "amoled": "Amoled",
    "dark": "Dark",
    "light": "Light",
    "catppuccinLatte": "Catppuccin (Latte)",
    "catppuccinFrappe": "Catppuccin (Frappe)",
    "catppuccinMacchiato": "Catppuccin (Macchiato)",
    "catppuccinMocha": "Catppuccin (Mocha)",
    "dracula": "Dracula",
    "everforest": "Everforest",
    "githubDark": "GitHub Dark",
    "githubLight": "GitHub Light",
    "gruvbox": "Gruvbox",
    "monokai": "Monokai",
    "nord": "Nord",
    "oneDark": "One Dark",
    "rosePine": "Rose Pine",
    "rosePineMoon": "Rose Pine Moon",
    "rosePineDawn": "Rose Pine Dawn",
    "solarizedDark": "Solarized Dark",
    "solarizedLight": "Solarized Light",
    "tokyoNight": "Tokyo Night",
    "tokyoNightStorm": "Tokyo Night Storm",
    "vesper": "Vesper",
    "zenburn": "Zenburn"
  },
  "voices": {
    "heart": "Heart (Female, US)",
    "bella": "Bella (Female, US)",
    "sarah": "Sarah (Female, US)",
    "nicole": "Nicole (Female, US)",
    "michael": "Michael (Male, US)",
    "adam": "Adam (Male, US)",
    "emma": "Emma (Female, UK)"
  },
  "fonts": {
    "default": "Default (Inter)"
  },
  "actions": {
    "grantMicAccess": "Grant Microphone Access",
    "rerunOnboarding": "Re-run Onboarding",
    "saveChanges": "Save Changes",
    "browseDirectory": "Browse directory"
  },
  "switches": {
    "fixedChatWidth": "Fixed chat width",
    "generateTitles": "Generate titles",
    "startRouterOnLaunch": "Start router on App launch",
    "exposeExternal": "Expose to external clients",
    "bindAll": "Bind on 0.0.0.0 (off = loopback only)",
    "pttHold": "Hold to record, release to stop",
    "pttToggle": "Toggle on/off"
  },
  "placeholders": {
    "modelPath": "/path/to/models",
    "checkpointsPath": "~/.config/warpcore/checkpoints/"
  },
  "labels": {
    "pttKey": "PTT Key"
  }
}
```

- [ ] **步骤 3：填充其他 12 个 namespace JSON 文件**

剩余 namespace 需要填充的内容（每个文件的 JSON key 参考对应页面的 `<Text>`、`title=`、`label=` 等硬编码字符串）：

| namespace | 主要字符串来源 | 预估条目数 |
|-----------|--------------|-----------|
| `chat.json` | Chat 页面标题、侧边栏标签、字体设置 | ~30 |
| `onboarding.json` | 5 步引导所有文本 | ~60 |
| `home.json` | 首页引导步骤文本 | ~80 |
| `servers.json` | 服务器管理页面、卡片、对话框 | ~50 |
| `backends.json` | 后端管理页面 | ~25 |
| `models.json` | 模型管理页面 | ~15 |
| `hub.json` | Hub 下载页面 | ~15 |
| `mcp.json` | MCP 配置页面 | ~20 |
| `recipes.json` | 配置方案页面 | ~20 |
| `checkpoints.json` | 检查点页面 | ~10 |
| `proxy.json` | 路由器/代理页面 | ~15 |
| `about.json` | 关于页面 | ~15 |

每个 JSON 文件初始为 `{}`，在后续步骤中逐个填充。

- [ ] **步骤 4：为所有 zh-CN JSON 创建空壳文件**

复制所有 en/*.json 到 zh-CN/ 目录，保留结构但值暂时留空（后续翻译阶段填充）：

```bash
Copy-Item packages/app/src/i18n/locales/en/*.json packages/app/src/i18n/locales/zh-CN/
```

---

### 任务 6：第一轮校验 — key 命名一致性检查

- [ ] **步骤 1：检查重复的 key**

检查所有 en/*.json 中是否有相同 key 出现多次（跨 namespace 重复是允许的，但需要确认语义一致）：

```bash
rg -o --no-filename '"([^"]+)":' packages/app/src/i18n/locales/en | sort | uniq -c | sort -rn | Select-Object -First 30
```

- [ ] **步骤 2：检查每个 namespace 的 key 数与预期一致**

```bash
Get-ChildItem packages/app/src/i18n/locales/en/*.json | ForEach-Object { $count = (Get-Content $_.FullName | rg -c '":'); Write-Output "$($_.Name): $count keys" }
```

- [ ] **步骤 3：验证 JSON 格式正确性**

```bash
Get-ChildItem packages/app/src/i18n/locales/en/*.json | ForEach-Object { try { Get-Content $_.FullName | ConvertFrom-Json | Out-Null; Write-Output "$($_.Name): ✓ valid" } catch { Write-Output "$($_.Name): ✗ INVALID - $_" } }
```

- [ ] **步骤 4：记录发现的问题并修正**

对以下问题逐一修正：
- Key 命名不一致（如 `backends` vs `backend` 命名空间中重复含义的 key）
- 同一语义的字符串在不同 namespace 中 key 名不同
- 插值语法错误（`{{` 不配对）
- JSON 语法错误

---

### 任务 7：第二轮校验 — 覆盖率检查

- [ ] **步骤 1：扫描所有源文件中的硬编码字符串，与 JSON 对比是否有遗漏**

```bash
rg -o --no-filename -g '*.tsx' "[>'\"]([A-Z][a-zA-Z]{2,}[^<'\"]*)[<'\"])" packages/app/src/pages packages/app/src/components | sort -u > extracted-en.txt
```

- [ ] **步骤 2：从 JSON 中提取所有英文 value，生成对比清单**

```bash
rg -o --no-filename '"([^"]+)":\s*"([^"]+)"' packages/app/src/i18n/locales/en | ForEach-Object { $_ -replace '.*:\s*"([^"]+)"', '$1' } | sort -u > json-en.txt
```

- [ ] **步骤 3：对比两份清单，找出遗漏的字符串**

```bash
Compare-Object (Get-Content extracted-en.txt) (Get-Content json-en.txt) | Where-Object { $_.SideIndicator -eq '<=' } | Select-Object -First 50
```

- [ ] **步骤 4：补充遗漏的字符串到对应的 namespace JSON 文件**

将遗漏的字符串添加到相应的 namespace JSON 中。

---

### 任务 8：Zustand Store 增加 locale 字段

**文件：**
- 修改：`packages/app/src/store/slices/settings.ts`
- 修改：`packages/app/src/store/types.ts`
- 修改：`packages/shared/src/types.ts`（`ISettings`）
- 修改：`packages/shared/src/index.ts`（导出新类型）

- [ ] **步骤 1：在 `ISettings` 中添加 locale 字段**

修改 `packages/shared/src/types.ts` 第 302-345 行，在 `ISettings` 接口末尾添加：

```typescript
export interface ISettings {
  // ... 现有字段 ...
  globalPTTKey?: string;
  globalPTTModeHold?: boolean;
  locale?: 'en' | 'zh-CN';          // [新增] 语言偏好
}
```

修改 `DEFAULT_SETTINGS` 第 346-387 行，添加默认值：

```typescript
export const DEFAULT_SETTINGS: ISettings = {
  // ... 现有字段 ...
  globalPTTKey: '',
  globalPTTModeHold: false,
  locale: 'en',                     // [新增]
};
```

- [ ] **步骤 2：在 `AppState` 中添加 locale selector**

修改 `packages/app/src/store/types.ts`：

在 `AppState` 接口中添加：
```typescript
locale: 'en' | 'zh-CN';
setLocale: (locale: 'en' | 'zh-CN') => void;
```

- [ ] **步骤 3：修改 settingsSlice 导出 locale/getter/setter**

修改 `packages/app/src/store/slices/settings.ts`：

```typescript
import { DEFAULT_SETTINGS, type ISettings } from '@warpcore/shared';
import type { AppState, ImmerSet, ImmerGet } from '../types';

interface SettingsSlice {
  settings: ISettings;
  locale: 'en' | 'zh-CN';
  setLocale: (locale: 'en' | 'zh-CN') => void;
}

export const settingsSlice = (_setState: ImmerSet<AppState>, _getState: ImmerGet<AppState>): Partial<AppState> => ({
  settings: DEFAULT_SETTINGS as ISettings,
  locale: (DEFAULT_SETTINGS.locale ?? 'en') as 'en' | 'zh-CN',
  setLocale: (locale) => {
    _setState((s) => {
      s.locale = locale;
      if (s.settings) {
        (s.settings as ISettings).locale = locale;
      }
    });
  },
});
```

- [ ] **步骤 4：在 store/index.ts 中导出 locale 和 setLocale**

修改 `packages/app/src/store/index.ts` 的 return 对象，在 settings 相关行之后添加：

```typescript
locale: settings.locale!,
setLocale: settings.setLocale!,
```

- [ ] **步骤 5：验证 TypeScript 编译**

```bash
npx tsc --noEmit -p packages/app/tsconfig.json
```

预期：无类型错误

---

### 任务 9：创建 I18nProvider 并在 main.tsx 中挂载

**文件：**
- 修改：`packages/app/src/main.tsx`
- 修改：`packages/app/src/App.tsx`（通过 hook 初始化 i18n）

- [ ] **步骤 1：在 App.tsx 中添加 i18n 初始化逻辑**

修改 `packages/app/src/App.tsx`，在组件顶部添加：

```typescript
import { useEffect } from 'react';
import { useStore } from './store';
import { initI18n, type SupportedLocale } from './i18n';

export function App() {
  const locale = useStore(s => s.locale);
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n(locale as SupportedLocale).then(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    if (i18nReady) {
      import('i18next').then(({ default: i18n }) => {
        if (i18n.language !== locale) {
          i18n.changeLanguage(locale);
        }
      });
    }
  }, [locale, i18nReady]);

  // ... 现有代码 ...

  if (!i18nReady) return null; // 或者 spinner

  return (
    <Routes>
      {/* ... 现有路由 ... */}
    </Routes>
  );
}
```

- [ ] **步骤 2：验证 i18n 初始化不报错**

```bash
npm run dev -w @warpcore/app
```

预期的运行时报错：缺少 zh-CN JSON 文件内容（因为目前是 en 副本）。

**说明**：zh-CN JSON 暂时保留英文内容不会导致功能问题，后续任务会翻译。

- [ ] **步骤 3：Commit**

```bash
git add packages/app/src/i18n/index.ts packages/app/src/store/ packages/shared/src/
git commit -m "feat(i18n): add i18n infrastructure - i18next init, store locale, provider"
```

---

### 任务 10-17：逐 namespace 替换组件硬编码为 t() 调用

以下 8 个任务遵循相同的替换模式，每个任务完成一个 namespace。

**替换模式参考：**

| 原始模式 | 替换后 |
|---------|--------|
| `<Text>Save</Text>` | `<Text>{t('actions.save')}</Text>` |
| `toast.error('Settings saved')` | `toast.error(t('toast.settingsSaved'))` |
| `title="Settings"` | `title={t('title')}` |
| `label="Fixed chat width"` | `label={t('switches.fixedChatWidth')}` |
| `placeholder="/path/to/models"` | `placeholder={t('placeholders.modelPath')}` |
| ``` `{n} model(s) found` ``` | ``` t('modelsFound', { count: n }) ``` |

### 任务 10：替换 common namespace（Shell + 通用组件）

**文件：**
- `packages/app/src/components/Shell.tsx`
- `packages/app/src/components/PageHeader.tsx`
- `packages/app/src/components/ConfirmDialog.tsx`
- `packages/app/src/components/KeyCapture.tsx`
- `packages/app/src/components/UpdateBanner.tsx`
- `packages/app/src/pages/Login/LoginPage.tsx`
- `packages/app/src/components/ToastProvider.tsx`

- [ ] **步骤 1：Shell.tsx — 替换导航标签**

修改 `packages/app/src/components/Shell.tsx`：

```typescript
// 添加 import
import { useTranslation } from 'react-i18next';

// 在组件内
const { t } = useTranslation('common');

// 修改 navItems 数组：
const navItems: INavItem[] = [
  { path: '/home', label: t('navigation.home'), icon: <Home /> },
  { path: '/servers', label: t('navigation.servers'), icon: <Server /> },
  { path: '/proxy', label: t('navigation.router'), icon: <Router /> },
  { path: '/checkpoints', label: t('navigation.checkpoints'), icon: <CheckpointIcon /> },
  { path: '/backends', label: t('navigation.backends'), icon: <Cpu /> },
  { path: '/recipes', label: t('navigation.recipes'), icon: <RecipeIcon /> },
  { path: '/models', label: t('navigation.models'), icon: <Box /> },
  { path: '/hub', label: t('navigation.hub'), icon: <Download /> },
  { path: '/mcp', label: t('navigation.mcp'), icon: <Plug /> },
  { path: '/chat', label: t('navigation.chat'), icon: <MessageSquare /> },
  { path: '/settings', label: t('navigation.settings'), icon: <Settings /> },
  { path: '/about', label: t('navigation.about'), icon: <Info /> },
];
```

- [ ] **步骤 2：ConfirmDialog.tsx — 替换按钮文本**

```typescript
// 添加 import
import { useTranslation } from 'react-i18next';
const { t } = useTranslation('common');

// 修改默认 props
<Button>{confirmLabel ?? t('actions.delete')}</Button>
<Button>{t('actions.cancel')}</Button>
```

- [ ] **步骤 3：LoginPage.tsx — 替换所有文本**

```typescript
const { t } = useTranslation('common');

// 标题
<Text>{t('login.title')}</Text>
<Text>{t('login.description')}</Text>

// 按钮
<Button>{loading ? t('login.loggingIn') : t('login.button')}</Button>

// 帮助文本
<Text>{t('login.help')}</Text>
```

- [ ] **步骤 4：UpdateBanner.tsx — 替换更新文本**

```typescript
const { t } = useTranslation('common');

<Text>{t('update.available', { version })}</Text>
<Button>{t('update.download')}</Button>
```

- [ ] **步骤 5：KeyCapture.tsx — 替换默认标签**

```typescript
const { t } = useTranslation('common');
// defaultLabel → t('labels.pttKey')
```

- [ ] **步骤 6：验证编译**

```bash
npx tsc --noEmit -p packages/app/tsconfig.json
```

- [ ] **步骤 7：Commit**

### 任务 11：替换 settings namespace

**文件：**
- `packages/app/src/pages/Settings/SettingsPage.tsx`

- [ ] **步骤 1：添加 useTranslation hook 并批量替换**

```typescript
const { t } = useTranslation('settings');
```

替换所有 section 标题、描述文本、切换标签、按钮文本、placeholder、主题/语音/字体名称。

关键替换：
```typescript
// Section 标题
<Text>{t('sections.theme')}</Text>
<Text>{t('descriptions.appearance')}</Text>

// 主题选项
const THEME_OPTIONS = [
  { label: t('themes.dark'), value: ETheme.DARK },
  { label: t('themes.light'), value: ETheme.LIGHT },
  // ...
]

// 开关
<Switch.Root label={t('switches.fixedChatWidth')} />

// 按钮
<Button>{t('actions.saveChanges')}</Button>
```

- [ ] **步骤 2：验证编译**

```bash
npx tsc --noEmit -p packages/app/tsconfig.json
```

- [ ] **步骤 3：Commit**

### 任务 12：替换 chat namespace

**文件：**
- `packages/app/src/pages/Chat/ChatPage.tsx`（及目录下其他文件）

- [ ] **步骤 1：添加 hook 并替换**

```typescript
const { t } = useTranslation('chat');
```

替换聊天页标题、设置标签、aria-label、按钮文案等。

- [ ] **步骤 2：验证编译后 Commit**

### 任务 13：替换 onboarding namespace

**文件：**
- `packages/app/src/pages/Onboarding/` 目录下所有文件

- [ ] **步骤 1：每个步骤组件添加 hook 并替换**

5 个步骤页面 + OnboardingPage.tsx + OnboardingFooter.tsx，逐个替换所有 `<Text>`、`<Heading>`、按钮文本。

- [ ] **步骤 2：验证编译后 Commit**

### 任务 14：替换 home namespace

**文件：**
- `packages/app/src/pages/Home/` 目录下所有文件

- [ ] **步骤 1：替换首页引导步骤所有长文本**

```typescript
const { t } = useTranslation('home');
```

3 个 guide step 组件 + HomePage.tsx 的标题/描述。

- [ ] **步骤 2：验证编译后 Commit**

### 任务 15：替换 servers namespace

**文件：**
- `packages/app/src/pages/Servers/` 目录下所有文件

- [ ] **步骤 1：替换服务器管理页面所有文本**

包括 ServerCard、LaunchForm、CheckpointDialog 等子组件。

- [ ] **步骤 2：验证编译后 Commit**

### 任务 16：替换 backends / models / hub / mcp / recipes / checkpoints / proxy / about namespace

**文件：**
- `packages/app/src/pages/Backends/`
- `packages/app/src/pages/Models/`
- `packages/app/src/pages/Hub/`
- `packages/app/src/pages/MCP/`
- `packages/app/src/pages/Recipes/`
- `packages/app/src/pages/Checkpoints/`
- `packages/app/src/pages/Proxy/`
- `packages/app/src/pages/About/`

- [ ] **步骤 1：逐个页面添加 useTranslation hook 并替换所有硬编码**

每个页面的替换量约 10-25 处字符串，按统一模式批量完成。

- [ ] **步骤 2：验证编译后 Commit**

---

### 任务 18：zh-CN 翻译（基于 en JSON 产出中文翻译）

**文件：**
- 修改：`packages/app/src/i18n/locales/zh-CN/*.json`（14 个文件）

- [ ] **步骤 1：翻译 common.json**

```json
{
  "navigation": {
    "home": "首页",
    "servers": "服务器",
    "router": "路由器",
    "checkpoints": "检查点",
    "backends": "后端",
    "recipes": "配置方案",
    "models": "模型",
    "hub": "Hub",
    "mcp": "MCP",
    "chat": "聊天",
    "settings": "设置",
    "about": "关于"
  },
  "actions": {
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "back": "上一步",
    "next": "下一步",
    "skip": "跳过",
    "close": "关闭",
    "confirm": "确认",
    "copy": "复制",
    "done": "完成",
    "previous": "上一个",
    "download": "下载"
  },
  "status": {
    "pending": "等待中",
    "running": "运行中",
    "ok": "正常",
    "failed": "失败",
    "cancelled": "已取消",
    "skipped": "已跳过",
    "completed": "已完成",
    "downloading": "下载中",
    "paused": "已暂停",
    "online": "在线",
    "offline": "离线"
  },
  "toast": {
    "settingsSaved": "设置已保存",
    "loginSuccess": "登录成功",
    "loginFailed": "登录失败",
    "scanFailed": "扫描失败",
    "deleteFailed": "删除失败",
    "renameFailed": "重命名失败",
    "searchFailed": "搜索失败",
    "downloadFailed": "下载失败",
    "saveFailed": "保存失败",
    "serverStartFailed": "启动服务器失败",
    "serverLaunchFailed": "启动服务器失败",
    "backendSaveFailed": "保存后端失败",
    "microphoneGranted": "麦克风权限已获取",
    "microphoneDenied": "麦克风权限被拒绝",
    "checkpointDeleted": "检查点已删除",
    "renamed": "已重命名",
    "backendAdded": "后端已添加",
    "backendUpdated": "后端已更新",
    "serverLaunched": "服务器已启动",
    "serverRelaunched": "服务器已重启",
    "serverConfigSaved": "服务器配置已保存",
    "downloading": "正在下载...",
    "tokenUpdated": "令牌已更新",
    "updateFailed": "更新失败",
    "downloadHistoryCleared": "下载历史已清除",
    "toolAlwaysApproved": "\"{{toolName}}\" 将在当前对话中始终批准",
    "directoryPickerNotSupported": "当前环境不支持目录选择器",
    "tokenNameRequired": "令牌名称为必填项",
    "selectWhisperBackend": "请选择一个 whisper 后端",
    "selectModelFile": "请选择一个模型文件",
    "checkpointIncompatible": "检查点与目标服务器不兼容"
  },
  "fields": {
    "name": "名称",
    "creationDate": "创建日期",
    "updateDate": "更新日期",
    "size": "大小",
    "slot": "槽位",
    "model": "模型",
    "user": "用户",
    "quant": "量化",
    "vision": "视觉",
    "params": "参数",
    "context": "上下文",
    "files": "文件",
    "downloads": "下载量",
    "likes": "点赞",
    "lastModified": "最后修改",
    "createdDate": "创建日期"
  },
  "update": {
    "available": "WarpCore v{{version}} 可用",
    "download": "下载"
  },
  "modelNotFound": "模型未找到！",
  "noMCPConfig": "未配置 MCP 服务器。点击 + 添加一个，或直接编辑 JSON。",
  "login": {
    "title": "WarpCore",
    "description": "请输入访问令牌以继续",
    "button": "登录",
    "loggingIn": "登录中...",
    "help": "请联系 WarpCore 管理员获取访问令牌"
  },
  "errors": {
    "THREAD_NOT_FOUND": "对话线程未找到",
    "MESSAGE_NOT_FOUND": "消息未找到",
    "SERVER_NOT_FOUND": "服务器未找到",
    "BACKEND_NOT_FOUND": "后端未找到",
    "BACKEND_GROUP_NOT_FOUND": "后端组未找到",
    "WHISPER_SERVER_NOT_FOUND": "Whisper 服务器未找到",
    "WHISPER_BACKEND_NOT_FOUND": "Whisper 后端未找到",
    "CHECKPOINT_NOT_FOUND": "检查点未找到",
    "RECIPE_NOT_FOUND": "配置方案未找到",
    "MODEL_NOT_FOUND": "模型未找到",
    "PRESET_NOT_FOUND": "预设未找到",
    "ELICITATION_NOT_FOUND": "引导请求未找到或已处理",
    "NAME_AND_PATH_REQUIRED": "名称和路径为必填项",
    "NAME_REQUIRED": "名称为必填项",
    "MISSING_REQUIRED_FIELDS": "缺少必填字段",
    "MISSING_PARTS_ARRAY": "缺少 parts 数组",
    "MISSING_UPDATES_ARRAY": "缺少 updates 数组",
    "INVALID_CONFIG": "配置无效",
    "MISSING_SERVER_NAME": "缺少服务器名称",
    "TOPIC_REQUIRED": "主题为必填项",
    "INVALID_OR_MISSING_MODE": "模式无效或缺失",
    "THREAD_ID_REQUIRED": "线程模式需要 Thread ID",
    "SERVER_ID_REQUIRED": "需要 Server ID",
    "INVALID_TOKEN": "令牌无效",
    "NOT_AUTHENTICATED": "未认证",
    "TOKEN_NOT_FOUND": "令牌未找到",
    "SERVER_NOT_RUNNING": "服务器未运行",
    "BUILTIN_RECIPES_READONLY": "内置配置方案为只读",
    "RECIPE_RUN_IN_PROGRESS": "配置方案运行中",
    "ACTIVE_BACKEND_MUST_BE_IN_GROUP": "活动后端必须在组内",
    "AT_LEAST_ONE_BACKEND_REQUIRED": "至少需要一个后端",
    "BACKEND_NOT_IN_GROUP": "后端不在组内",
    "WHISPER_SERVER_NOT_RUNNING": "Whisper 服务器未运行",
    "WHISPER_UPSTREAM_ERROR": "Whisper 上游错误",
    "DESTINATION_NOT_MODEL_DIR": "目标不是已配置的模型目录",
    "KOKORO_NOT_READY": "Kokoro 未就绪",
    "INVALID_DECISION": "决策无效",
    "MISSING_THREAD_OR_SERVER_ID": "缺少 Thread ID 或 Server ID",
    "UPDATE_CHECK_FAILED": "检查更新失败",
    "NO_MODEL_DIRECTORIES": "未配置模型目录",
    "NO_ACTIVE_COMPLETION": "无活跃的补全任务"
  }
}
```

- [ ] **步骤 2：翻译其他 13 个 namespace JSON**

逐个翻译 settings、chat、onboarding、home、servers、backends、models、hub、mcp、recipes、checkpoints、proxy、about。

每个文件的翻译原则：
- 中文术语统一（如 backends → "后端"、server → "服务器"）
- 保持 insert 变量名不变（`{{count}}`、`{{version}}` 等）
- 中英文之间不加空格（专有名词如 Whisper、CUDA、GGUF 除外）

- [ ] **步骤 3：验证 JSON 格式**

```bash
Get-ChildItem packages/app/src/i18n/locales/zh-CN/*.json | ForEach-Object { try { Get-Content $_.FullName | ConvertFrom-Json | Out-Null; Write-Output "$($_.Name): ✓ valid" } catch { Write-Output "$($_.Name): ✗ INVALID" } }
```

- [ ] **步骤 4：Commit**

---

### 任务 19：服务端错误码系统 — shared 类型定义

**文件：**
- 创建：`packages/shared/src/i18n-errors.ts`
- 修改：`packages/shared/src/index.ts`

- [ ] **步骤 1：创建错误码枚举**

```typescript
export enum I18nErrorCode {
  THREAD_NOT_FOUND = 'THREAD_NOT_FOUND',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  SERVER_NOT_FOUND = 'SERVER_NOT_FOUND',
  BACKEND_NOT_FOUND = 'BACKEND_NOT_FOUND',
  BACKEND_GROUP_NOT_FOUND = 'BACKEND_GROUP_NOT_FOUND',
  WHISPER_SERVER_NOT_FOUND = 'WHISPER_SERVER_NOT_FOUND',
  WHISPER_BACKEND_NOT_FOUND = 'WHISPER_BACKEND_NOT_FOUND',
  CHECKPOINT_NOT_FOUND = 'CHECKPOINT_NOT_FOUND',
  RECIPE_NOT_FOUND = 'RECIPE_NOT_FOUND',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  PRESET_NOT_FOUND = 'PRESET_NOT_FOUND',
  ELICITATION_NOT_FOUND = 'ELICITATION_NOT_FOUND',
  NAME_AND_PATH_REQUIRED = 'NAME_AND_PATH_REQUIRED',
  NAME_REQUIRED = 'NAME_REQUIRED',
  MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS',
  MISSING_PARTS_ARRAY = 'MISSING_PARTS_ARRAY',
  MISSING_UPDATES_ARRAY = 'MISSING_UPDATES_ARRAY',
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_SERVER_NAME = 'MISSING_SERVER_NAME',
  TOPIC_REQUIRED = 'TOPIC_REQUIRED',
  INVALID_OR_MISSING_MODE = 'INVALID_OR_MISSING_MODE',
  THREAD_ID_REQUIRED = 'THREAD_ID_REQUIRED',
  SERVER_ID_REQUIRED = 'SERVER_ID_REQUIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  SERVER_NOT_RUNNING = 'SERVER_NOT_RUNNING',
  BUILTIN_RECIPES_READONLY = 'BUILTIN_RECIPES_READONLY',
  RECIPE_RUN_IN_PROGRESS = 'RECIPE_RUN_IN_PROGRESS',
  ACTIVE_BACKEND_MUST_BE_IN_GROUP = 'ACTIVE_BACKEND_MUST_BE_IN_GROUP',
  AT_LEAST_ONE_BACKEND_REQUIRED = 'AT_LEAST_ONE_BACKEND_REQUIRED',
  BACKEND_NOT_IN_GROUP = 'BACKEND_NOT_IN_GROUP',
  WHISPER_SERVER_NOT_RUNNING = 'WHISPER_SERVER_NOT_RUNNING',
  WHISPER_UPSTREAM_ERROR = 'WHISPER_UPSTREAM_ERROR',
  DESTINATION_NOT_MODEL_DIR = 'DESTINATION_NOT_MODEL_DIR',
  KOKORO_NOT_READY = 'KOKORO_NOT_READY',
  INVALID_DECISION = 'INVALID_DECISION',
  MISSING_THREAD_OR_SERVER_ID = 'MISSING_THREAD_OR_SERVER_ID',
  UPDATE_CHECK_FAILED = 'UPDATE_CHECK_FAILED',
  NO_MODEL_DIRECTORIES = 'NO_MODEL_DIRECTORIES',
  NO_ACTIVE_COMPLETION = 'NO_ACTIVE_COMPLETION',
}
```

- [ ] **步骤 2：在 shared/src/index.ts 中导出**

```typescript
export { I18nErrorCode } from './i18n-errors';
```

---

### 任务 20：服务端路由错误消息改造

**文件：**
- 修改：`packages/server/src/routes/` 目录下约 22 个文件

- [ ] **步骤 1：逐个路由文件替换英文错误消息为错误码**

模式：

```typescript
// 之前
res.status(404).json({ ok: false, error: 'Thread not found', data: null });

// 之后
import { I18nErrorCode } from '@warpcore/shared';
res.status(404).json({ ok: false, error: I18nErrorCode.THREAD_NOT_FOUND, data: null });
```

关键映射表：

| 原英文消息 | 错误码 |
|-----------|--------|
| `'Thread not found'` | `I18nErrorCode.THREAD_NOT_FOUND` |
| `'Message not found'` | `I18nErrorCode.MESSAGE_NOT_FOUND` |
| `'Server not found'` | `I18nErrorCode.SERVER_NOT_FOUND` |
| `'Backend not found'` | `I18nErrorCode.BACKEND_NOT_FOUND` |
| `'Backend group not found'` | `I18nErrorCode.BACKEND_GROUP_NOT_FOUND` |
| `'Whisper server not found'` | `I18nErrorCode.WHISPER_SERVER_NOT_FOUND` |
| `'Whisper backend not found'` | `I18nErrorCode.WHISPER_BACKEND_NOT_FOUND` |
| `'Checkpoint not found'` | `I18nErrorCode.CHECKPOINT_NOT_FOUND` |
| `'Recipe not found'` | `I18nErrorCode.RECIPE_NOT_FOUND` |
| `'Model not found'` | `I18nErrorCode.MODEL_NOT_FOUND` |
| `'Preset not found'` | `I18nErrorCode.PRESET_NOT_FOUND` |
| `'Elicitation not found or already resolved'` | `I18nErrorCode.ELICITATION_NOT_FOUND` |
| `'Name and path are required'` | `I18nErrorCode.NAME_AND_PATH_REQUIRED` |
| `'Name is required'` | `I18nErrorCode.NAME_REQUIRED` |
| `'Missing required fields'` | `I18nErrorCode.MISSING_REQUIRED_FIELDS` |
| `'Missing parts array'` | `I18nErrorCode.MISSING_PARTS_ARRAY` |
| `'Missing updates array'` | `I18nErrorCode.MISSING_UPDATES_ARRAY` |
| `'Invalid config'` | `I18nErrorCode.INVALID_CONFIG` |
| `'Missing server name'` | `I18nErrorCode.MISSING_SERVER_NAME` |
| `'Topic is required'` | `I18nErrorCode.TOPIC_REQUIRED` |
| `'Invalid or missing mode'` | `I18nErrorCode.INVALID_OR_MISSING_MODE` |
| `'ThreadId required for thread mode'` | `I18nErrorCode.THREAD_ID_REQUIRED` |
| `'serverId required'` | `I18nErrorCode.SERVER_ID_REQUIRED` |
| `'Invalid token'` | `I18nErrorCode.INVALID_TOKEN` |
| `'Not authenticated'` | `I18nErrorCode.NOT_AUTHENTICATED` |
| `'Token not found'` | `I18nErrorCode.TOKEN_NOT_FOUND` |
| `'Server not running'` | `I18nErrorCode.SERVER_NOT_RUNNING` |
| `'Built-in recipes are read-only'` | `I18nErrorCode.BUILTIN_RECIPES_READONLY` |
| `'A recipe run is already in progress'` | `I18nErrorCode.RECIPE_RUN_IN_PROGRESS` |
| `'Active backend must be in the group'` | `I18nErrorCode.ACTIVE_BACKEND_MUST_BE_IN_GROUP` |
| `'At least one backend is required'` | `I18nErrorCode.AT_LEAST_ONE_BACKEND_REQUIRED` |
| `'Backend not in group'` | `I18nErrorCode.BACKEND_NOT_IN_GROUP` |
| `'Whisper server not running'` | `I18nErrorCode.WHISPER_SERVER_NOT_RUNNING` |
| `'Whisper upstream error'` | `I18nErrorCode.WHISPER_UPSTREAM_ERROR` |
| `'Destination is not a configured model directory'` | `I18nErrorCode.DESTINATION_NOT_MODEL_DIR` |
| `'kokoro not ready'` | `I18nErrorCode.KOKORO_NOT_READY` |
| `'Invalid decision'` | `I18nErrorCode.INVALID_DECISION` |
| `'Missing threadId or serverId'` | `I18nErrorCode.MISSING_THREAD_OR_SERVER_ID` |
| `'Failed to check for updates'` | `I18nErrorCode.UPDATE_CHECK_FAILED` |
| `'No model directories configured'` | `I18nErrorCode.NO_MODEL_DIRECTORIES` |
| `'No active completion'` | `I18nErrorCode.NO_ACTIVE_COMPLETION` |

- [ ] **步骤 2：确认服务端编译通过**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json
```

- [ ] **步骤 3：Commit**

---

### 任务 21：客户端错误拦截器

**文件：**
- 修改：`packages/app/src/api/client.ts`

- [ ] **步骤 1：在 api 请求函数中添加错误码映射**

修改 `packages/app/src/api/client.ts` 的 `request` 和 `requestList` 函数，在错误返回时仍然保持原始 `error` 字符串的兼容性，但错误码将通过 `common.json` 中的 `errors` 段在 UI 层翻译。

实际上，由于错误消息在 `client.ts` 中是被重新包装为 `Error` 字符串的，我们不需要在这里做特殊处理。翻译应该发生在 `services.ts` 中使用 toast 的地方。

修改方案：在 `services.ts` 中的 toast 调用前添加错误翻译逻辑。

创建一个工具函数 `translateError`：

```typescript
// packages/app/src/api/translateError.ts
import type { I18nErrorCode } from '@warpcore/shared';
import { useTranslation } from 'react-i18next';

export function useTranslateError() {
  const { t } = useTranslation('common');
  return (errorCode: string | I18nErrorCode): string => {
    const key = `errors.${errorCode}`;
    const translated = t(key);
    // 如果翻译 key 不存在，返回原始错误码
    return translated === key ? errorCode : translated;
  };
}
```

- [ ] **步骤 2：在 services.ts 中使用错误翻译**

修改 `packages/app/src/api/services.ts`，在所有 `toast.error(response.error)` 调用处改为：

```typescript
const translateError = useTranslateError();
toast.error(translateError(response.error ?? ''));
```

- [ ] **步骤 3：验证编译后 Commit**

---

### 任务 22：Settings 添加语言切换入口

**文件：**
- 修改：`packages/app/src/pages/Settings/SettingsPage.tsx`

- [ ] **步骤 1：导入语言切换依赖**

```typescript
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
```

- [ ] **步骤 2：在 Appearance 区域添加语言选择器**

在 Settings 页面主题设置的同一区域（Appearance section）添加：

```tsx
const { t } = useTranslation('settings');
const locale = useStore(s => s.locale);
const setLocale = useStore(s => s.setLocale);

<Field label={t('sections.language')}>
  <Combobox
    items={[
      { label: 'English', value: 'en' },
      { label: '简体中文', value: 'zh-CN' },
    ]}
    value={locale}
    onChange={(val) => {
      setLocale(val as 'en' | 'zh-CN');
      i18next.changeLanguage(val);
    }}
  />
</Field>
```

- [ ] **步骤 3：验证切换功能**

启动开发服务器，切换到中文，确认所有页面文本切换正确。

```bash
npm run dev -w @warpcore/app
```

- [ ] **步骤 4：Commit**

---

### 任务 23：构建验证与测试

- [ ] **步骤 1：TypeScript 全量编译检查**

```bash
npx tsc --noEmit -p packages/app/tsconfig.json
npx tsc --noEmit -p packages/server/tsconfig.json
npx tsc --noEmit -p packages/shared/tsconfig.json
```

预期：0 错误

- [ ] **步骤 2：Vite 构建检查**

```bash
npm run build -w @warpcore/app
```

预期：构建成功无报错

- [ ] **步骤 3：i18next-parser 重新扫描校验**

```bash
npm run i18n:extract -w @warpcore/app
```

预期：parser 扫描后 JSON 文件不应有新增/丢失的 key

- [ ] **步骤 4：手动功能验证清单**

| 验证项 | 操作 | 预期结果 |
|--------|------|---------|
| 默认语言 | 首次打开应用 | 界面为英文 |
| 切换到中文 | Settings → Language → 简体中文 | 所有界面文本切换为中文 |
| 刷新保持 | 切换语言后刷新页面 | 仍保持切换后的语言 |
| Toast 通知 | 触发保存/错误操作 | Toast 文本为当前语言 |
| 导航标签 | 查看侧边栏 | 标签为当前语言 |
| Onboarding | 重新运行引导 | 引导文本为当前语言 |
| 服务端错误 | 触发无效操作 | 错误提示为当前语言 |
| 插值文本 | 触发版本更新提示 | "vX.X.X 可用"格式正确 |

- [ ] **步骤 5：最终 Commit**

```bash
git add -A
git commit -m "feat(i18n): add zh-CN support with full i18n implementation"
```
