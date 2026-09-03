type TDraftModelCandidate = {
	file: {
		fileName: string;
		filePath: string;
		metadata?: {
			architecture: string;
			fileSize?: number;
			tensorCount?: number;
			nextnPredictLayers?: number;
		} | null;
	};
};

type TSpecDecodeMode = "draft" | "ngram" | "mtp" | "dflash" | undefined;

const DEDICATED_DRAFT_ARCHITECTURES: Record<string, string> = {
	"draft-eagle3": "eagle3",
	"draft-dflash": "dflash",
	"draft-dspark": "dflash",
};

const MTP_FILENAME_PATTERN = /(?:^|[-_.\s])(?:mtp|nextn)(?=$|[-_.\s])/i;

function normalizedDirectory(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	const lastSeparator = normalized.lastIndexOf("/");
	return (lastSeparator >= 0 ? normalized.slice(0, lastSeparator) : "").toLowerCase();
}

function isDflashArchitecture(architecture: string | undefined): boolean {
	return architecture?.toLowerCase() === "dflash";
}

function dedicatedDraftArchitecture(mode: TSpecDecodeMode, specType?: string): string | null {
	if (mode === "dflash") return "dflash";
	if ((mode ?? "draft") !== "draft" || !specType) return null;
	return DEDICATED_DRAFT_ARCHITECTURES[specType] ?? null;
}

function isMtpSidecar<T extends TDraftModelCandidate>(entry: T, targetEntry: T): boolean {
	const metadata = entry.file.metadata;
	const targetMetadata = targetEntry.file.metadata;
	if (!metadata || !targetMetadata) return false;
	if (metadata.architecture.toLowerCase() !== targetMetadata.architecture.toLowerCase()) return false;
	if (!MTP_FILENAME_PATTERN.test(entry.file.fileName)) return false;

	// A complete model whose name merely says that MTP was preserved is not an
	// external MTP sidecar. Prefer tensor counts, then file size, to distinguish
	// the compact NextN-only GGUF from another full-model quantization.
	if (metadata.tensorCount && targetMetadata.tensorCount) {
		return metadata.tensorCount < targetMetadata.tensorCount / 2;
	}
	if (metadata.fileSize && targetMetadata.fileSize) {
		return metadata.fileSize < targetMetadata.fileSize / 2;
	}
	return (metadata.nextnPredictLayers ?? 0) > 0;
}

export function getDraftModelCandidates<T extends TDraftModelCandidate>(
	entries: T[],
	targetEntry: T | null | undefined,
	mode: TSpecDecodeMode,
	specType?: string,
): T[] {
	if (!targetEntry || mode === "ngram") return [];

	const targetArchitecture = targetEntry.file.metadata?.architecture;
	const targetDirectory = normalizedDirectory(targetEntry.file.filePath);
	const requiredSidecarArchitecture = dedicatedDraftArchitecture(mode, specType);
	const candidates = entries.filter((entry) => {
		if (entry.file.filePath === targetEntry.file.filePath) return false;
		if (mode === "mtp") {
			return normalizedDirectory(entry.file.filePath) === targetDirectory && isMtpSidecar(entry, targetEntry);
		}
		if (requiredSidecarArchitecture === "dflash") {
			return isDflashArchitecture(entry.file.metadata?.architecture);
		}
		if (requiredSidecarArchitecture) {
			return entry.file.metadata?.architecture?.toLowerCase() === requiredSidecarArchitecture;
		}
		if (isMtpSidecar(entry, targetEntry)) return false;
		return Boolean(targetArchitecture) && entry.file.metadata?.architecture === targetArchitecture;
	});

	return candidates.sort((left, right) => {
		const leftIsSibling = normalizedDirectory(left.file.filePath) === targetDirectory;
		const rightIsSibling = normalizedDirectory(right.file.filePath) === targetDirectory;
		if (leftIsSibling !== rightIsSibling) return leftIsSibling ? -1 : 1;
		return left.file.fileName.localeCompare(right.file.fileName);
	});
}

export function getAutoSelectedDraftModelPath<T extends TDraftModelCandidate>(
	candidates: T[],
	targetModelPath: string | null,
	currentDraftModelPath: string,
	mode: TSpecDecodeMode,
	specType?: string,
): string | null {
	const supportsSidecarAutoSelection = mode === "mtp" || Boolean(dedicatedDraftArchitecture(mode, specType));
	if (!supportsSidecarAutoSelection || !targetModelPath || currentDraftModelPath) return null;

	const targetDirectory = normalizedDirectory(targetModelPath);
	const siblingCandidates = candidates.filter(
		(candidate) => normalizedDirectory(candidate.file.filePath) === targetDirectory,
	);

	return siblingCandidates.length === 1 ? siblingCandidates[0]!.file.filePath : null;
}
