export function encodeHubPathSegment(value: string): string {
	return encodeURIComponent(value);
}

export function encodeHubFilePath(value: string): string {
	return value.split('/').map(encodeHubPathSegment).join('/');
}

export function huggingFaceModelUrl(author: string, modelName: string): string {
	return `https://huggingface.co/${encodeHubPathSegment(author)}/${encodeHubPathSegment(modelName)}`;
}
