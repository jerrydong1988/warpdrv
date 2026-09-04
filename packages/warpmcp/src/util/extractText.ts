import { Readability } from "@mozilla/readability";
import { DOMParser } from "linkedom";
import TurndownService from "turndown";

export interface ExtractedContent {
	title: string;
	byline: string;
	url: string;
	markdown: string;
	usedReadability: boolean;
}

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
});

// these carry no readable content
turndown.remove(["script", "style", "noscript", "iframe", "canvas", "svg", "form"]);

interface ILinkNode {
	hasAttribute(name: string): boolean;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
}

interface ILinkedomDocument {
	querySelectorAll(selector: string): ArrayLike<ILinkNode>;
	title: string;
	body: { innerHTML: string } | null;
	toString(): string;
}

// rewrite relative href/src values against the page url so links survive
function absolutise(document: ILinkedomDocument, pageUrl: string): void {
	const nodes = Array.from(document.querySelectorAll("a[href], img[src]"));
	for (const node of nodes) {
		const attribute = node.hasAttribute("href") ? "href" : "src";
		const value = node.getAttribute(attribute);
		if (!value) {
			continue;
		}
		try {
			node.setAttribute(attribute, new URL(value, pageUrl).href);
		} catch {
			// leave unparsable values as they are
		}
	}
}

export function extractContent(html: string, pageUrl: string): ExtractedContent {
	const document = new DOMParser().parseFromString(
		html,
		"text/html",
	) as unknown as ILinkedomDocument;
	absolutise(document, pageUrl);

	let title = document.title ?? "";
	let byline = "";
	let contentHtml = "";
	let usedReadability = false;

	try {
		// readability mutates the document it parses, so give it a throwaway copy
		const clone = new DOMParser().parseFromString(document.toString(), "text/html");
		const article = new Readability(clone as unknown as Document).parse();
		if (article && article.content) {
			contentHtml = article.content;
			title = article.title || title;
			byline = article.byline || "";
			usedReadability = true;
		}
	} catch {
		// fall through to whole-body conversion
	}

	// non-article pages (docs indexes, dashboards) return nothing from readability
	if (!contentHtml) {
		contentHtml = document.body ? document.body.innerHTML : html;
	}

	const markdown = turndown
		.turndown(contentHtml)
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return { title, byline, url: pageUrl, markdown, usedReadability };
}
