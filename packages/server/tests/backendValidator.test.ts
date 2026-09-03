import { describe, expect, it } from 'vitest';
import { ELlamaFlashAttentionMode, ELlamaLoadMode } from '@warpcore/shared';
import { parseLlamaBuildInfo, parseLlamaHelpCapabilities, resolveLlamaCliPath } from '../src/services/backendValidator';

describe('llama.cpp build metadata parsing', () => {
	it('parses the current semantic version/build/commit format', () => {
		expect(parseLlamaBuildInfo([
			'version: 0.1.0-dev (build 10448, commit ad1de39e0)',
			'built with Clang 23.0.0 for Windows AMD64',
		].join('\n'))).toEqual({ buildNumber: '10448', gitCommit: 'ad1de39e0' });
	});

	it('retains support for the legacy build/commit format', () => {
		expect(parseLlamaBuildInfo('version: 9293 (1acee6bf8)')).toEqual({
			buildNumber: '9293',
			gitCommit: '1acee6bf8',
		});
	});

	it('resolves the companion llama-cli path on Windows and Unix', () => {
		expect(resolveLlamaCliPath('C:\\llama\\llama-server.exe')).toBe('C:\\llama\\llama-cli.exe');
		expect(resolveLlamaCliPath('/opt/llama/llama-server')).toBe('/opt/llama/llama-cli');
	});
});

describe('llama.cpp help capability parsing', () => {
	it('separates current, deprecated, and removed flags and captures accepted values', () => {
		const help = `
	-fa,   --flash-attn [on|off|auto]       set Flash Attention use
	-lm,   --load-mode MODE                  model loading mode (default: auto)
                                          - auto: mmap when supported
                                          - none: no special mode
                                          - mmap: memory-map model
                                          - mlock: lock model memory
                                          - mmap+mlock: combine both
                                          - dio: use DirectIO
--mlock                                   DEPRECATED in favor of --load-mode
--spec-draft-n-max N                     number of tokens to draft
--spec-type none,draft-mtp,ngram-simple,ngram-mod,ngram-cache
--draft, --draft-n, --draft-max N         the argument has been removed. use --spec-draft-n-max
`;
		const capabilities = parseLlamaHelpCapabilities(help, 1234);

		expect(capabilities.probedAt).toBe(1234);
		expect(capabilities.supportedFlags).toContain('--load-mode');
		expect(capabilities.deprecatedFlags).toContain('--mlock');
		expect(capabilities.removedFlags).toContain('--draft-max');
		expect(capabilities.supportedFlags).not.toContain('--draft-max');
		expect(capabilities.removedFlags).not.toContain('--spec-draft-n-max');
		expect(capabilities.flashAttentionModes).toEqual(Object.values(ELlamaFlashAttentionMode));
		expect(capabilities.loadModes).toEqual(Object.values(ELlamaLoadMode));
		expect(capabilities.specTypes).toEqual(['none', 'draft-mtp', 'ngram-simple', 'ngram-mod', 'ngram-cache']);
	});
});
