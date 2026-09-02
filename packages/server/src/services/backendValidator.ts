import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import type { IDevice, ILlamaBackendCapabilities } from '@warpcore/shared';
import { EDeviceBackendType, ELlamaFlashAttentionMode, ELlamaLoadMode } from '@warpcore/shared';
const execFileAsync = promisify(execFile);

export interface IBuildInfo {
	buildNumber: string;
	gitCommit: string;
}

export interface IValidationResult {
	valid: boolean;
	version: string;
	buildInfo: IBuildInfo | null;
	capabilities: ILlamaBackendCapabilities | null;
	devices: IDevice[];
	error: string | null;
}

const CAPABILITY_SCHEMA_VERSION = 1 as const;
const KNOWN_SPEC_TYPES = [
	'none',
	'draft-simple',
	'draft-eagle3',
	'draft-mtp',
	'draft-dflash',
	'draft-dspark',
	'ngram-simple',
	'ngram-map-k',
	'ngram-map-k4v',
	'ngram-mod',
	'ngram-cache',
];

export function parseLlamaBuildInfo(output: string): IBuildInfo | null {
	const modern = output.match(/version:\s*[^\r\n]*?\(\s*build\s+(\d+)\s*,\s*commit\s+([a-f0-9]+)\s*\)/i);
	if (modern) {
		return { buildNumber: modern[1]!, gitCommit: modern[2]! };
	}

	const legacy = output.match(/version:\s*(\d+)\s*\(\s*([a-f0-9]+)\s*\)/i);
	return legacy ? { buildNumber: legacy[1]!, gitCommit: legacy[2]! } : null;
}

function splitHelpBlocks(output: string): string[] {
	const blocks: string[] = [];
	let current = '';
	for (const line of output.replace(/\r/g, '').split('\n')) {
		if (/^\s{0,8}-{1,2}[A-Za-z]/.test(line)) {
			if (current) blocks.push(current);
			current = line;
		} else if (current) {
			current += `\n${line}`;
		}
	}
	if (current) blocks.push(current);
	return blocks;
}

function flagsInHelpBlock(block: string): string[] {
	// Only the option signature declares flags. Replacement names mentioned in
	// a removed option's explanation must not themselves be marked as removed.
	const firstLine = (block.split('\n', 1)[0] ?? '').trimStart();
	let signature = firstLine;
	for (const gap of firstLine.matchAll(/\s{2,}(?=\S)/g)) {
		const prefix = firstLine.slice(0, gap.index).trimEnd();
		// llama.cpp aligns aliases after a comma with extra spaces. The first
		// non-alias alignment gap separates the signature from its description.
		if (prefix.endsWith(',')) continue;
		signature = prefix;
		break;
	}
	return Array.from(signature.matchAll(/(?:^|[\s,])(-{1,2}[A-Za-z][A-Za-z0-9-]*)/g), match => match[1]!);
}

export function parseLlamaHelpCapabilities(output: string, probedAt = Date.now()): ILlamaBackendCapabilities {
	const supported = new Set<string>();
	const deprecated = new Set<string>();
	const removed = new Set<string>();
	const blocks = splitHelpBlocks(output);

	for (const block of blocks) {
		const blockFlags = flagsInHelpBlock(block);
		const lower = block.toLowerCase();
		if (lower.includes('argument has been removed')) {
			for (const flag of blockFlags) removed.add(flag);
			continue;
		}
		for (const flag of blockFlags) supported.add(flag);
		if (lower.includes('deprecated')) {
			for (const flag of blockFlags) deprecated.add(flag);
		}
	}

	const loadModeBlock = blocks.find(block => flagsInHelpBlock(block).includes('--load-mode')) ?? '';
	const loadModes = (Object.values(ELlamaLoadMode) as ELlamaLoadMode[]).filter(mode =>
		new RegExp(`^\\s*-\\s+${mode.replace('+', '\\+')}\\s*:`, 'm').test(loadModeBlock)
	);
	const flashAttentionBlock = blocks.find(block => {
		const flags = flagsInHelpBlock(block);
		return flags.includes('-fa') || flags.includes('--flash-attn');
	}) ?? '';
	const flashAttentionModes = (Object.values(ELlamaFlashAttentionMode) as ELlamaFlashAttentionMode[])
		.filter(mode => flashAttentionBlock.includes(mode));
	const specTypeBlock = blocks.find(block => flagsInHelpBlock(block).includes('--spec-type')) ?? '';
	const specTypes = KNOWN_SPEC_TYPES.filter(type => specTypeBlock.includes(type));

	return {
		schemaVersion: CAPABILITY_SCHEMA_VERSION,
		probedAt,
		supportedFlags: [...supported].sort(),
		deprecatedFlags: [...deprecated].sort(),
		removedFlags: [...removed].sort(),
		flashAttentionModes,
		loadModes,
		specTypes,
	};
}

// Run llama-server --version to get build number and git commit hash
export async function getBuildInfo(binaryPath: string): Promise<IBuildInfo | null> {
	try {
		const { stdout, stderr } = await execFileAsync(binaryPath, ['--version'], {
			timeout: 10000,
		});
		const output = stderr + stdout;
		return parseLlamaBuildInfo(output);
	} catch (err) {
		console.log(`[getBuildInfo] error for ${binaryPath}:`, String(err));
		return null;
	}
}

export async function getBackendCapabilities(binaryPath: string): Promise<ILlamaBackendCapabilities | null> {
	try {
		const { stdout, stderr } = await execFileAsync(binaryPath, ['-h'], {
			timeout: 10000,
			maxBuffer: 2 * 1024 * 1024,
		});
		return parseLlamaHelpCapabilities(stderr + stdout);
	} catch (err) {
		console.log(`[getBackendCapabilities] error for ${binaryPath}:`, String(err));
		return null;
	}
}

export async function refreshBackendCompatibility(
	binaryPath: string,
	currentBuildInfo: IBuildInfo | null,
	currentCapabilities?: ILlamaBackendCapabilities,
): Promise<{ buildInfo: IBuildInfo | null; capabilities: ILlamaBackendCapabilities | null; changed: boolean }> {
	const buildInfo = await getBuildInfo(binaryPath);
	if (!buildInfo) {
		const capabilitiesMissing = !currentCapabilities || currentCapabilities.schemaVersion !== CAPABILITY_SCHEMA_VERSION;
		if (!capabilitiesMissing) {
			return { buildInfo: currentBuildInfo, capabilities: currentCapabilities, changed: false };
		}
		const capabilities = await getBackendCapabilities(binaryPath);
		return { buildInfo: currentBuildInfo, capabilities, changed: capabilities !== null };
	}

	const buildChanged = !currentBuildInfo
		|| currentBuildInfo.buildNumber !== buildInfo.buildNumber
		|| currentBuildInfo.gitCommit !== buildInfo.gitCommit;
	const capabilitiesMissing = !currentCapabilities || currentCapabilities.schemaVersion !== CAPABILITY_SCHEMA_VERSION;
	if (!buildChanged && !capabilitiesMissing) {
		return { buildInfo, capabilities: currentCapabilities, changed: false };
	}

	const capabilities = await getBackendCapabilities(binaryPath);
	return { buildInfo, capabilities, changed: true };
}

export function resolveLlamaCliPath(binaryPath: string): string {
	return binaryPath.replace(/llama-server(?=\.exe$|$)/i, 'llama-cli');
}

// Run llama-cli --list-devices to detect compiled backends
// New builds (>= 9100) only show Available devices section
// Old builds show verbose CUDA/ROCm/Vulkan init lines
async function getVersion(binaryPath: string, buildNumber: number): Promise<string | null> {
	try {
		const cliPath = resolveLlamaCliPath(binaryPath);
		const { stdout, stderr } = await execFileAsync(cliPath, ['--list-devices'], {
			timeout: 10000,
		});
		const output = stderr + stdout;
		console.log(`[getVersion] buildNumber=${buildNumber}, output for ${binaryPath}:`, JSON.stringify(output));

		const parts: string[] = [];

		if (buildNumber >= 9100) {
			// New builds: detect GPU backends from Available devices section
			const deviceTypeMatch = output.match(/Available devices:.*\n\s+(CUDA|ROCm|Vulkan)\d:/s);
			if (deviceTypeMatch?.[1]) {
				parts.push(deviceTypeMatch[1]);
			}
			console.log(`[getVersion] new build detection, parts:`, parts);
		} else {
			// Old builds: detect from verbose init lines
			if (output.match(/ggml_cuda_init: found \d+ CUDA devices/)) {
				parts.push('CUDA');
			}
			if (output.match(/ggml_cuda_init: found \d+ ROCm devices/) ||
				output.match(/ggml_rocm_init/i) ||
				output.match(/Available devices:.*\n.*ROCm\d:/s)) {
				parts.push('ROCm');
			}
			if (output.match(/Found \d+ Vulkan devices/i) ||
				output.includes('ggml_vulkan:')) {
				parts.push('Vulkan');
			}
			console.log(`[getVersion] old build detection, parts:`, parts);
		}

		return parts.length > 0 ? parts.join(', ') : 'unknown';
	} catch {
	// console.log(`[getVersion] error for ${binaryPath}:`, String(err));
		return null;
	}
}
// Run llama-cli --list-devices to discover available GPUs
async function listDevices(binaryPath: string, backendId: string): Promise<IDevice[]> {
	// llama-cli is in the same directory as llama-server
	const cliPath = resolveLlamaCliPath(binaryPath);
	const devices: IDevice[] = [];
	try {
		const { stdout, stderr } = await execFileAsync(cliPath, ['--list-devices'], {
			timeout: 15000,
		});
		const output = stderr + stdout;
		// Primary parser: "Available devices:" section at the end
		// This is the most reliable format and matches what llama-server expects
		// Format: "  CUDA0: Name (VRAM MiB, FREE MiB free)"
		const availMatch = output.matchAll(/\s+(CUDA|ROCm|Vulkan)(\d+): (.+?) \((\d+) MiB, (\d+) MiB free\)/g);
		for (const match of availMatch) {
			const backendType = match[1] as string;
			const deviceIndex = match[2] as string;
			// Use the exact ID format llama-server expects: "CUDA0", "Vulkan1", etc.
			const deviceId = `${backendType}${deviceIndex}`;
			const backendTypeEnum = backendType === 'CUDA' ? EDeviceBackendType.CUDA
				: backendType === 'ROCm' ? EDeviceBackendType.ROCM
				: EDeviceBackendType.VULKAN;
			devices.push({
				id: deviceId,
				name: match[3]!,
				backendType: backendTypeEnum,
				backendId,
				computeCapability: '',
				vramTotalMb: parseInt(match[4]!, 10),
				vramFreeMb: parseInt(match[5]!, 10),
				connection: '',
			});
		}
		// If the "Available devices:" section was found, use those results
		// Otherwise fall back to parsing the verbose init output
		if (devices.length > 0) {
			// Build a name→device map for O(1) lookup instead of linear scan
			const nameToDevice = new Map<string, IDevice>();
			for (const d of devices) {
				nameToDevice.set(d.name, d);
			}

			// Enrich with compute capability from verbose output
			const cudaCapMatch = output.matchAll(/Device \d+: (.+?), compute capability (\S+)/g);
			for (const match of cudaCapMatch) {
				const deviceName = match[1]!;
				const cap = match[2]!;
				const dev = nameToDevice.get(deviceName);
				if (dev && dev.backendType === EDeviceBackendType.CUDA) {
					dev.computeCapability = cap;
				}
			}
			const rocmCapMatch = output.matchAll(/Device \d+: (.+?), (\w+) \(0x\w+\)/g);
			for (const match of rocmCapMatch) {
				const deviceName = match[1]!;
				const cap = match[2]!;
				const dev = nameToDevice.get(deviceName);
				if (dev && dev.backendType === EDeviceBackendType.ROCM) {
					dev.computeCapability = cap;
				}
			}
			return devices;
		}
		// Fallback: parse verbose init output for older llama.cpp builds
		// that don't have the "Available devices:" section
		// Parse CUDA devices
		let cudaIdx = 0;
		const cudaMatch = output.matchAll(/Device \d+: (.+?), compute capability (\S+), VMM: \w+, VRAM: (\d+) MiB/g);
		for (const match of cudaMatch) {
			devices.push({
				id: `CUDA${cudaIdx}`,
				name: match[1]!,
				backendType: EDeviceBackendType.CUDA,
				backendId,
				computeCapability: match[2]!,
				vramTotalMb: parseInt(match[3]!, 10),
				vramFreeMb: 0,
				connection: '',
			});
			cudaIdx++;
		}
		// Parse ROCm devices
		let rocmIdx = 0;
		const rocmMatch = output.matchAll(/Device \d+: (.+?), (\w+) \(0x\w+\), VMM: \w+, Wave Size: \d+, VRAM: (\d+) MiB/g);
		for (const match of rocmMatch) {
			devices.push({
				id: `ROCm${rocmIdx}`,
				name: match[1]!,
				backendType: EDeviceBackendType.ROCM,
				backendId,
				computeCapability: match[2]!,
				vramTotalMb: parseInt(match[3]!, 10),
				vramFreeMb: 0,
				connection: '',
			});
			rocmIdx++;
		}
		// Parse Vulkan devices
		const vulkanVerboseMatch = output.matchAll(/ggml_vulkan: (\d+) = (.+?) \|/g);
		// Build a name→type map for O(1) lookup
		const nameToBackendType = new Map<string, EDeviceBackendType>();
		for (const d of devices) {
			nameToBackendType.set(d.name, d.backendType);
		}
		for (const match of vulkanVerboseMatch) {
			// Only add if not already covered
			const idx = parseInt(match[1]!, 10);
			const name = match[2]!.trim();
			const baseName = name.split('(')[0]!.trim();
			const existingType = nameToBackendType.get(baseName);
			if (existingType !== EDeviceBackendType.VULKAN) {
				const vulkanDevice: IDevice = {
					id: `Vulkan${idx}`,
					name,
					backendType: EDeviceBackendType.VULKAN,
					backendId,
					computeCapability: '',
					vramTotalMb: 0,
					vramFreeMb: 0,
					connection: '',
				};
				devices.push(vulkanDevice);
				nameToBackendType.set(baseName, EDeviceBackendType.VULKAN);
			}
		}
	} catch {
		// llama-cli might not exist or might fail
	}
	return devices;
}
// Full validation: check binary exists, get build info, version, discover devices
export async function validateBackend(binaryPath: string, backendId: string): Promise<IValidationResult> {
	// Check file exists
	try {
		await fs.access(binaryPath, fs.constants.X_OK);
	} catch {
		return { valid: false, version: '', buildInfo: null, capabilities: null, devices: [], error: 'Binary not found or not executable' };
	}
	// Get build info first (needed for version detection logic)
	const buildInfo = await getBuildInfo(binaryPath);
	const buildNumber = buildInfo ? parseInt(buildInfo.buildNumber, 10) : 0;
	const capabilities = await getBackendCapabilities(binaryPath);
	// console.log(`[validateBackend] binary=${binaryPath}, buildNumber=${buildNumber}`);
	// Get GPU backend version (uses buildNumber to choose detection logic)
	const version = await getVersion(binaryPath, buildNumber);
	if (!version) {
		return { valid: false, version: '', buildInfo, capabilities, devices: [], error: 'Failed to get version — binary may be invalid' };
	}
	// Discover devices
	const devices = await listDevices(binaryPath, backendId);
	const result = { valid: true, version, buildInfo, capabilities, devices, error: null };
	// console.log(`[validateBackend] result for ${binaryPath}:`, JSON.stringify({ ...result, devices: result.devices.map(d => ({ ...d, backendId: d.backendId })) }));
	return result;
}
