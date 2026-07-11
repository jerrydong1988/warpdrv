import { useCallback, useRef } from 'react';
import { useStore } from '@/store';
import { useRealm } from '@/hooks/useRealm';
import { extractTextFromFile } from '@/hooks/useFileReader';
import { EServerStatus } from '@warpcore/shared';

interface AttachmentPart {
	id: string;
	type: 'attachment';
	orderIndex: number;
	data: string;
	mimeType: string;
	fileName: string;
	fileSize: number;
	extractedText?: string;
}

async function processAttachmentFile(att: any): Promise<AttachmentPart | null> {
	if (!att.file || !(att.file instanceof File)) return null;

	const isImage = att.file.type.startsWith('image/');
	if (isImage) {
		const base64 = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(att.file);
		});
		return {
			id: att.id || crypto.randomUUID(),
			type: 'attachment',
			orderIndex: 0,
			data: base64,
			mimeType: att.file.type || 'application/octet-stream',
			fileName: att.file.name,
			fileSize: att.file.size,
		};
	}

	let extractedText = '';
	try {
		extractedText = await extractTextFromFile(att.file);
	} catch (err) {
		console.error('[processAttachmentFile] failed to extract text from', att.file.name, err);
	}
	if (!extractedText) return null;

	return {
		id: att.id || crypto.randomUUID(),
		type: 'attachment',
		orderIndex: 0,
		data: '',
		mimeType: att.file.type || 'application/octet-stream',
		fileName: att.file.name,
		fileSize: att.file.size,
		extractedText,
	};
}

async function processAttachmentContent(att: any): Promise<AttachmentPart | null> {
	if (!att.content) return null;
	const imagePart = att.content.find((p: any) => p.type === 'image');
	if (!imagePart) return null;

	const base64 = imagePart.image.startsWith('data:') ? imagePart.image.split(',')[1] : imagePart.image;
	return {
		id: att.id || crypto.randomUUID(),
		type: 'attachment',
		orderIndex: 0,
		data: base64,
		mimeType: att.contentType || 'image/*',
		fileName: att.name,
		fileSize: 0,
	};
}

export function useOnNewV2(executeCommands: (args: { prompt: string }) => Promise<void>) {
	const realmEvents = useRealm(useStore(s => s.currentThreadId ?? null));
	const realmRef = useRef(realmEvents);
	realmRef.current = realmEvents;

	const onNewV2 = useCallback(async (message: any) => {
		const state = useStore.getState();
		const currentThreadId = state.currentThreadId;
		const currentServerId = state.tempThreadServerId;
		if (!currentServerId) return;
		const currentServer = state.servers[currentServerId];
		if (!currentServer || currentServer.status !== EServerStatus.RUNNING) return;

		const text = (message.content as any[])
			.filter((p: any) => p.type === 'text')
			.map((p: any) => p.text)
			.join('')
			.trim();

		const pendingSlashCommands = state.pendingSlashCommands;
		await executeCommands({ prompt: text });
		state.clearPendingSlashCommands();

		const isNewThread = !currentThreadId || !state.threads[currentThreadId];

		// Process attachments
		const attachments = message.attachments || [];
		const attachmentParts: AttachmentPart[] = [];
		for (const att of attachments) {
			const filePart = await processAttachmentFile(att);
			if (filePart) attachmentParts.push(filePart);
			const contentPart = await processAttachmentContent(att);
			if (contentPart) attachmentParts.push(contentPart);
		}

		const body: any = {
			threadId: currentThreadId,
			userMessage: { content: text },
			parentId: state.headMessageIdByThread[currentThreadId!] ?? null,
			serverId: currentServerId,
			whisperServerId: state.selectedWhisperServerId,
			folderId: state.activeWorkspaceId ?? null,
			enableAutoEmbed: state.tempAutoEmbed,
			systemPrompt: state.currentSystemPrompt,
			inferenceParams: state.currentInferenceParams,
			generateTitle: !state.settings.disableTitleGen,
			attachAllTools: state.attachAllTools,
			attachedTools: state.attachAllTools ? undefined : state.attachedTools,
			messageState: pendingSlashCommands.length > 0 ? { slashCommands: pendingSlashCommands } : {},
			threadState: (isNewThread && state.tempThreadState) ? state.tempThreadState : undefined,
		};

		if (attachmentParts.length > 0) {
			body.attachments = attachmentParts;
		}

		// Pipe for FEApplet to intercept (guardrails, etc.)
		const pipeResult = await realmRef.current.eventNode.pipe(
			'bridge.preCompletion',
			{ body, slashCommands: pendingSlashCommands, threadId: currentThreadId },
			'.',
			true,
		);

		if (!text.trim() || !pipeResult) return;

		await fetch('/api/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
	}, [executeCommands]);

	return onNewV2;
}
