import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("../src/pages/Chat/ChatSidebar.tsx", import.meta.url),
	"utf8",
);

describe("ChatSidebar tab strip", () => {
	it("keeps the strip vertical and free of a parent click handler", () => {
		const stripStart = source.indexOf("{/* Tab strip (always visible on right edge) */}");
		const firstTabStart = source.indexOf("{/* Search tab */}", stripStart);

		expect(stripStart).toBeGreaterThan(-1);
		expect(firstTabStart).toBeGreaterThan(stripStart);

		const stripContainer = source.slice(stripStart, firstTabStart);
		expect(stripContainer).toContain('w="60px"');
		expect(stripContainer).toContain('flexDirection="column"');
		expect(stripContainer).toContain('alignItems="center"');
		expect(stripContainer).not.toContain("onClick=");
	});

	it("renders exactly one independent button for every sidebar tab", () => {
		const tabs = [
			"SEARCH",
			"RIGHT_PANEL",
			"GUARDRAILS_PANEL",
			"TODOS_PANEL",
			"MODES_PANEL",
			"PROMPTS_PANEL",
			"AGENTS_PANEL",
			"TOOLS",
			"CONFIG",
		];

		for (const tab of tabs) {
			const handler = `onClick={() => toggleTab(EChatSidebarTab.${tab})}`;
			expect(source.split(handler)).toHaveLength(2);
		}
	});
});
