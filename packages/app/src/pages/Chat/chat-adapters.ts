export const getFileDataURL = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});

export const attachmentAdapter = {
	accept: '*',
	add: async ({ file }: { file: File }) => ({
		id: file.name + '-' + Date.now(),
		type: file.type.startsWith('image/') ? 'image' : 'document',
		name: file.name,
		contentType: file.type,
		file,
		status: { type: 'requires-action' as const, reason: 'composer-send' as const },
	}),
	remove: async () => {},
	send: async (att: any) => {
		const dataUrl = await getFileDataURL(att.file);
		return {
			...att,
			status: { type: 'complete' as const },
			content: [{ type: 'image', image: dataUrl }],
		};
	},
};
