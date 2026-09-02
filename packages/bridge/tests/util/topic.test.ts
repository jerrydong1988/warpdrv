import { describe, expect, it } from 'vitest';
import { folderNameToTopic } from '../../src/util/topic';

describe('folderNameToTopic', () => {
	it('lowercases the input', () => {
		expect(folderNameToTopic('Hello World')).toBe('hello-world');
	});

	it('strips punctuation and special characters', () => {
		expect(folderNameToTopic('Hello, World!')).toBe('hello-world');
		expect(folderNameToTopic('a@b#c$d')).toBe('abcd');
	});

	it('collapses whitespace into single hyphens', () => {
		expect(folderNameToTopic('a  b\tc')).toBe('a-b-c');
	});

	it('collapses repeated hyphens', () => {
		expect(folderNameToTopic('a--b---c')).toBe('a-b-c');
	});

	it('trims leading and trailing hyphens', () => {
		expect(folderNameToTopic('-draft-')).toBe('draft');
		expect(folderNameToTopic('  spaced  ')).toBe('spaced');
	});

	it('keeps letters, digits, spaces and hyphens only', () => {
		expect(folderNameToTopic('Release v2.0 (2024)')).toBe('release-v20-2024');
	});

	it('drops non-ASCII characters', () => {
		expect(folderNameToTopic('café')).toBe('caf');
	});

	it('handles empty input', () => {
		expect(folderNameToTopic('')).toBe('');
	});
});
