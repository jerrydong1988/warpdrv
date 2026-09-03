import { describe, expect, it } from "vitest";
import { formatBytes } from "../src/utils/intl";

describe("locale-aware formatting helpers", () => {
	it("formats byte sizes at each binary unit boundary", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(1024)).toBe("1 KB");
		expect(formatBytes(1024 * 1024)).toBe("1 MB");
		expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
	});
});
