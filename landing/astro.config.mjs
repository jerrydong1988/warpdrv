import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
	vite: {
		build: { cssTarget: "chrome110" },
	},
	integrations: [
		starlight({
			title: "warpdrv",
			favicon: "/favicon.ico",
			sidebar: [
				{
					label: "Initial setup",
					items: [
						{ label: "Installation", slug: "docs/guides/installation" },
						{ label: "Onboarding", slug: "docs/guides/onboarding" },
						{
							label: "Downloading & running your first AI model",
							slug: "docs/guides/first-model",
						},
						{
							label: "Improving your chat experience",
							slug: "docs/guides/chat-experience",
						},
					],
				},
				{
					label: "How-to guides",
					items: [
						{ label: "Set up voice", slug: "docs/guides/voice" },
						{ label: "Use the model router", slug: "docs/guides/model-router" },
						{ label: "Switch to the latest LLAMA.cpp", slug: "docs/guides/backends" },
						{
							label: "Compile llama.cpp for your system",
							slug: "docs/guides/compiling",
						},
						{ label: "Set up a workspace", slug: "docs/guides/workspace" },
						{ label: "Using tools", slug: "docs/guides/tools" },
						{ label: "Workflow, Part 1 — Modes", slug: "docs/guides/modes" },
						{ label: "Workflow, Part 2 — Guardrails", slug: "docs/guides/guardrails" },
					],
				},
			],
		}),
	],
});
