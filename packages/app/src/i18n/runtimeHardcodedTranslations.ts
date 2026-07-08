import i18next from 'i18next';

const zhCN: Record<string, string> = {
	'Accept Threshold': '接受阈值',
	'Add a model directory in Settings first to enable downloading.': '请先在设置中添加模型目录以启用下载。',
	'Add Alias': '添加别名',
	'Add Attachment': '添加附件',
	'Add to annotations': '添加到注释',
	'Add todo...': '添加待办...',
	'Additional whisper-server flags': '额外 whisper-server 参数',
	'Advanced': '高级',
	'Aliases': '别名',
	'All clear': '全部正常',
	'All compatible': '全部兼容',
	'All Recipes': '全部配置方案',
	'All tools': '全部工具',
	'Allow Always': '始终允许',
	'Allow Once': '允许一次',
	'Arguments': '参数',
	'Auto': '自动',
	'Auto-detect': '自动检测',
	'Auto-embed': '自动嵌入',
	'Auto-embed messages': '自动嵌入消息',
	'Auto-launch at startup': '启动时自动启动',
	'Auto-load latest checkpoint on start': '启动时自动加载最新检查点',
	'Auto-save checkpoint on stop': '停止时自动保存检查点',
	'Autofit GPU layers': '自动适配 GPU 层数',
	'Autofit GPU Layers': '自动适配 GPU 层数',
	'Backend': '后端',
	'Backends': '后端',
	'Batch Size': '批大小',
	'Beam Size (-bs)': '束大小 (-bs)',
	'Browse directory': '浏览目录',
	'Browse file': '浏览文件',
	'Build whisper.cpp from source and register the whisper-server binary here.': '从源码构建 whisper.cpp，并在这里注册 whisper-server 二进制文件。',
	'Built-in': '内置',
	'Cache Prompt': '缓存提示词',
	'Cancel': '取消',
	'Cannot save checkpoints when multi-modal is enabled': '启用多模态时无法保存检查点',
	'Chat': '聊天',
	'Chat Appearance': '聊天外观',
	'Chat settings': '聊天设置',
	'Chat Template': '聊天模板',
	'Clear all': '全部清除',
	'Close': '关闭',
	'Comma-separated tool names': '以逗号分隔的工具名称',
	'Context': '上下文',
	'Context Size': '上下文大小',
	'Controls': '控制项',
	'Convert (ffmpeg)': '转换 (ffmpeg)',
	'Create your first recipe': '创建你的第一个配置方案',
	'Currently running:': '当前正在运行：',
	'Custom Flags': '自定义参数',
	'Custom Prompt': '自定义提示词',
	'Custom rules...': '自定义规则...',
	'Decline': '拒绝',
	'Default (Inter)': '默认 (Inter)',
	'Delete': '删除',
	'Delete Backend Group?': '删除后端组？',
	'Delete Backend?': '删除后端？',
	'Delete Guardrail': '删除护栏',
	'Delete Recipe?': '删除配置方案？',
	'Delete Server': '删除服务',
	'Delete Todo': '删除待办',
	'Delete Whisper Backend?': '删除 Whisper 后端？',
	'Deny': '拒绝',
	'Describe this workspace...': '描述这个工作区...',
	'Device': '设备',
	'Direct I/O': '直接 I/O',
	'Disable': '禁用',
	'Distribute layers across GPUs': '在多个 GPU 间分配层',
	'Done': '完成',
	'Draft Device': '草稿设备',
	'Draft Max': '草稿最大值',
	'Draft Min': '草稿最小值',
	'Draft Model': '草稿模型',
	'Draft N-Max': '草稿 N-Max',
	'Drafting Parameters': '草稿参数',
	'Edit JSON directly. Only non-default values are saved as overrides.': '直接编辑 JSON。只有非默认值会保存为覆盖项。',
	'Edit Server': '编辑服务',
	'Embedding': '嵌入',
	'Enable /v1/embeddings endpoint for RAG': '启用用于 RAG 的 /v1/embeddings 端点',
	'Enable multi-GPU split': '启用多 GPU 拆分',
	'Enable speculative decoding': '启用推测解码',
	'Enable thinking': '启用思考',
	'Enable Thinking': '启用思考',
	'Equal distribution': '均匀分配',
	'Extra Args': '额外参数',
	'Fixed chat width': '固定聊天宽度',
	'Fixed width': '固定宽度',
	'Flash Attention': 'Flash Attention',
	'Font Family': '字体',
	'Font Size': '字体大小',
	'Frequency Penalty': '频率惩罚',
	'Generation': '生成',
	'Go to Settings': '前往设置',
	'GPU Layers': 'GPU 层数',
	'Group': '组',
	'Groups': '组',
	'Guardrails': '护栏',
	'Image Attachment Preview': '图片附件预览',
	'Include previous n messages': '包含前 n 条消息',
	'Include root message': '包含根消息',
	'Inference Params': '推理参数',
	'Initial prompt': '初始提示词',
	'Jinja': 'Jinja',
	'KV Cache Quantization': 'KV 缓存量化',
	'Language (-l)': '语言 (-l)',
	'Largest': '最大',
	'Last message': '最后一条消息',
	'Latest': '最新',
	'Launch Server': '启动服务',
	'Leave empty to use target device.': '留空则使用目标设备。',
	'Let llama.cpp auto-distribute layers': '让 llama.cpp 自动分配层',
	'Load Checkpoint': '加载检查点',
	'Load KV Checkpoint': '加载 KV 检查点',
	'Messages': '消息',
	'Method:': '方法：',
	'Micro Batch': '微批大小',
	'Min Hits': '最小命中数',
	'Min P': 'Min P',
	'Mirostat Eta': 'Mirostat Eta',
	'Mirostat Mode': 'Mirostat 模式',
	'Mirostat Tau': 'Mirostat Tau',
	'MLock': 'MLock',
	'MMap': 'MMap',
	'Model': '模型',
	'Model Folders': '模型文件夹',
	'Model Params': '模型参数',
	'Monitor': '监控',
	'Multi-GPU Split': '多 GPU 拆分',
	'Multi-modal': '多模态',
	'Multi-modal disabled': '多模态已禁用',
	'New Chat': '新建聊天',
	'No backend groups': '没有后端组',
	'No backend groups. Create one in Backends page.': '没有后端组。请在后端页面创建一个。',
	'No backends registered': '没有已注册的后端',
	'No backends registered. Go to Backends page.': '没有已注册的后端。请前往后端页面。',
	'No checkpoints available': '没有可用检查点',
	'No embedding servers running': '没有正在运行的嵌入服务',
	'No GPU': '无 GPU',
	'No guardrails': '没有护栏',
	'No matches': '没有匹配项',
	'No matching backends': '没有匹配的后端',
	'No matching groups': '没有匹配的组',
	'No MCP servers': '没有 MCP 服务',
	'No model directory configured': '未配置模型目录',
	'No recipes yet': '还没有配置方案',
	'No recommended params available for this model': '此模型没有可用的推荐参数',
	'No results found': '未找到结果',
	'No servers': '没有服务',
	'No threads yet': '还没有会话',
	'No todos yet': '还没有待办',
	'No tools': '没有工具',
	'No Warmup': '不预热',
	'No whisper backends registered': '没有已注册的 Whisper 后端',
	'No whisper backends. Add one in Backends page.': '没有 Whisper 后端。请在后端页面添加一个。',
	'No whisper models scanned.': '尚未扫描到 Whisper 模型。',
	'None (custom)': '无（自定义）',
	'Official releases': '官方发布',
	'Options': '选项',
	'Overwrite target slots?': '覆盖目标槽位？',
	'Parallel Slots': '并行槽位',
	'Parameters': '参数',
	'Presence Penalty': '存在惩罚',
	'Preset': '预设',
	'Preset name...': '预设名称...',
	'Processing...': '处理中...',
	'Processors (-p)': '处理器 (-p)',
	'Prompt': '提示词',
	'Reasoning effort': '推理强度',
	'Reasoning Effort': '推理强度',
	'Reasoning Format': '推理格式',
	'Repeat Penalty': '重复惩罚',
	'Reset to defaults': '重置为默认值',
	'Response Format': '响应格式',
	'Restart Server': '重启服务',
	'Result': '结果',
	'Result:': '结果：',
	'Running': '运行中',
	'Sampling': '采样',
	'Save KV Checkpoint': '保存 KV 检查点',
	'Screenshot placeholder': '截图占位',
	'Search': '搜索',
	'Search backends...': '搜索后端...',
	'Search compatible draft models...': '搜索兼容的草稿模型...',
	'Search groups...': '搜索组...',
	'Search HuggingFace for GGUF models': '在 HuggingFace 搜索 GGUF 模型',
	'Search models...': '搜索模型...',
	'Search whisper models...': '搜索 Whisper 模型...',
	'Select': '选择',
	'Select a model to view details': '选择一个模型查看详情',
	'Select a target model first to see compatible draft models.': '请先选择目标模型以查看兼容的草稿模型。',
	'Select server': '选择服务',
	'Select slots': '选择槽位',
	'Server': '服务',
	'Server Info': '服务信息',
	'Server logs': '服务日志',
	'Server Name': '服务名称',
	'Slot': '槽位',
	'Spec Type': '推测类型',
	'Speculative Decoding': '推测解码',
	'Split Mode': '拆分模式',
	'Stop Server': '停止服务',
	'SWA Full': '完整 SWA',
	'System Prompt': '系统提示词',
	'Tell WarpCore where your GGUF models live. Models should follow the user/model folder structure.': '告诉 WarpCore 你的 GGUF 模型存放位置。模型应遵循 user/model 文件夹结构。',
	'Temperature': '温度',
	'Temperature (-tp)': '温度 (-tp)',
	'These params will apply to all servers that use this Model.': '这些参数会应用到所有使用此模型的服务。',
	'This server': '此服务',
	'Threads': '会话',
	'Threads (-t)': '线程 (-t)',
	'Threads (Batch)': '线程（批处理）',
	'Toggle right panel': '切换右侧面板',
	'Toggle threads list': '切换会话列表',
	'Tools': '工具',
	'Top K': 'Top K',
	'Top P': 'Top P',
	'Translate': '翻译',
	'Trigger only on tool calls': '仅在工具调用时触发',
	'TTS Speed': 'TTS 速度',
	'Try adjusting your search query': '请尝试调整搜索条件',
	'Use embedding mode': '使用嵌入模式',
	'Use multi-modal (mmproj)': '使用多模态 (mmproj)',
	'Use recommended params': '使用推荐参数',
	'Vision': '视觉',
	'Vision requires mmproj.GGUF': '视觉功能需要 mmproj.GGUF',
	'Whisper.cpp Backends': 'Whisper.cpp 后端',
	'You are a helpful assistant...': '你是一个乐于助人的助手...',
	'You will be sent to:': '你将被发送到：',
};

const attrs = ['placeholder', 'title', 'aria-label', 'label'] as const;
const originalText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Map<string, string>>();
let observer: MutationObserver | null = null;
let queued = false;

function isChinese(): boolean {
	return i18next.language?.toLowerCase().startsWith('zh') === true;
}

function translated(value: string): string | null {
	return zhCN[value.trim()] ?? null;
}

function replacePreservingWhitespace(value: string, replacement: string): string {
	const leading = value.match(/^\s*/)?.[0] ?? '';
	const trailing = value.match(/\s*$/)?.[0] ?? '';
	return `${leading}${replacement}${trailing}`;
}

function shouldSkipElement(element: Element): boolean {
	const tag = element.tagName.toLowerCase();
	return tag === 'script' || tag === 'style' || tag === 'code' || tag === 'pre';
}

function translateTextNode(node: Text): void {
	const parent = node.parentElement;
	if (!parent || shouldSkipElement(parent)) return;
	const original = originalText.get(node) ?? node.nodeValue ?? '';
	const replacement = translated(original);
	if (!replacement) return;
	originalText.set(node, original);
	const next = isChinese() ? replacePreservingWhitespace(original, replacement) : original;
	if (node.nodeValue !== next) node.nodeValue = next;
}

function translateAttributes(element: Element): void {
	if (shouldSkipElement(element)) return;
	for (const attr of attrs) {
		const current = element.getAttribute(attr);
		if (!current) continue;
		let originals = originalAttrs.get(element);
		const original = originals?.get(attr) ?? current;
		const replacement = translated(original);
		if (!replacement) continue;
		if (!originals) {
			originals = new Map();
			originalAttrs.set(element, originals);
		}
		originals.set(attr, original);
		const next = isChinese() ? replacement : original;
		if (element.getAttribute(attr) !== next) element.setAttribute(attr, next);
	}
}

function walk(root: ParentNode): void {
	if (!document.body) return;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	let node: Node | null = root instanceof Document ? document.body : root as Node;
	while (node) {
		if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
		if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node as Element);
		node = walker.nextNode();
	}
}

function scheduleApply(): void {
	if (queued) return;
	queued = true;
	requestAnimationFrame(() => {
		queued = false;
		walk(document.body);
	});
}

export function startRuntimeHardcodedTranslations(): void {
	if (observer || typeof document === 'undefined') return;
	observer = new MutationObserver(scheduleApply);
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
		attributeFilter: [...attrs],
	});
	i18next.on('languageChanged', scheduleApply);
	scheduleApply();
}
