import { describe, expect, it } from 'vitest';
import { cleanSchema, isSafePath, validateToolArgs } from '../src/validation';

describe('validateToolArgs', () => {
	it('accepts args matching the schema', () => {
		const result = validateToolArgs(
			{
				type: 'object',
				properties: { name: { type: 'string' }, count: { type: 'integer' } },
				required: ['name'],
			},
			{ name: 'Ada', count: 3 },
		);
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it('rejects args missing a required property', () => {
		const result = validateToolArgs(
			{
				type: 'object',
				properties: { name: { type: 'string' } },
				required: ['name'],
			},
			{},
		);
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors.join(' ')).toContain('name');
	});

	it('rejects args with a wrong type', () => {
		const result = validateToolArgs(
			{ type: 'object', properties: { count: { type: 'integer' } } },
			{ count: 'not-a-number' },
		);
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('reports errors with instance paths', () => {
		const result = validateToolArgs(
			{
				type: 'object',
				properties: { nested: { type: 'object', properties: { flag: { type: 'boolean' } } } },
			},
			{ nested: { flag: 'yes' } },
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.startsWith('/nested/flag'))).toBe(true);
	});

	it('returns invalid with the compile error for a malformed schema', () => {
		const result = validateToolArgs({ type: 'bogus-type' }, {});
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBe(1);
		expect(result.errors[0]).toContain('schema is invalid');
	});
});

describe('isSafePath', () => {
	it('accepts plain relative paths', () => {
		expect(isSafePath('notes.txt')).toBe(true);
		expect(isSafePath('docs/plan.md')).toBe(true);
		expect(isSafePath('C:\\Users\\me\\notes.txt')).toBe(true);
		expect(isSafePath('')).toBe(true);
	});

	it('rejects parent-directory traversal', () => {
		expect(isSafePath('../etc/passwd')).toBe(false);
		expect(isSafePath('a/../../b')).toBe(false);
		expect(isSafePath('..\\windows\\system32')).toBe(false);
	});

	it('rejects sensitive system prefixes', () => {
		expect(isSafePath('/etc/passwd')).toBe(false);
		expect(isSafePath('/proc/self/maps')).toBe(false);
		expect(isSafePath('/sys/kernel')).toBe(false);
	});

	it('rejects dot-ssh and gnupg paths anywhere in the string', () => {
		expect(isSafePath('/home/user/.ssh/id_rsa')).toBe(false);
		expect(isSafePath('backup/.gnupg/private.key')).toBe(false);
	});
});

describe('cleanSchema', () => {
	it('removes $schema and keeps everything else', () => {
		const schema = {
			$schema: 'http://json-schema.org/draft-07/schema#',
			type: 'object',
			properties: { a: { type: 'string' } },
		};
		const cleaned = cleanSchema(schema);
		expect(cleaned).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
		expect(cleaned).not.toHaveProperty('$schema');
	});

	it('does not mutate the input schema', () => {
		const schema = { $schema: 'x', type: 'object' };
		cleanSchema(schema);
		expect(schema).toHaveProperty('$schema');
	});
});
