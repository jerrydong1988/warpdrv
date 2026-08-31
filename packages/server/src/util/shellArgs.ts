import { parse as shellParse } from 'shell-quote';

/**
 * Split a user-supplied CLI fragment into argv tokens.
 *
 * shell-quote returns `{ op: 'glob', pattern }` objects for unquoted `*`, `?`
 * or `[...]` tokens. Filtering those out (the previous behaviour) silently
 * dropped the argument *and* shifted the pairing of every following flag, so a
 * value like `--include *.ts` turned into a valueless `--include`. The process
 * is spawned without a shell, so passing the literal pattern through is exactly
 * what the child expects.
 */
export function parseArgTokens(input: string): string[] {
	if (!input.trim()) return [];
	const out: string[] = [];
	for (const token of shellParse(input)) {
		if (typeof token === 'string') {
			out.push(token);
			continue;
		}
		const obj = token as unknown as { op?: string; pattern?: string; env?: string };
		if (typeof obj?.pattern === 'string') {
			out.push(obj.pattern); // glob literal
		}
		// Shell operators (&&, |, ;) and env assignments are not representable
		// as literal argv tokens and are intentionally ignored.
	}
	return out;
}
