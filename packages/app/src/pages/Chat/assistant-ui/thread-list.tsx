import { ThreadListPrimitive } from "@assistant-ui/react";
import { Box, HStack, Input, Menu, Portal, Text, VStack } from "@chakra-ui/react";
import type { IChatThread as IBridgeChatThread, IFolder as IChatFolder } from "@warpcore/bridge";
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderPlusIcon,
	MoreHorizontalIcon,
	PencilIcon,
	SearchIcon,
	SortAscIcon,
	SortDescIcon,
	TrashIcon,
	XIcon,
} from "lucide-react";
import { arrayToTree } from "performant-array-to-tree";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IoStarSharp } from "react-icons/io5";
import { fetchWorkspace } from "@/api/services";
import { useThreadsAndFolders } from "@/hooks/useThreadsAndFolders";
import { useStore } from "@/store";

// ============================================================
// Types
// ============================================================
interface IChatThread extends IBridgeChatThread {
	messageCount?: number;
	totalTokens?: number;
}

type TSortField = "updatedAt" | "createdAt" | "title" | "messageCount";
type TSortDir = "asc" | "desc";

interface TreeEntry {
	id: string;
	parentId: string;
	type: "folder" | "thread";
	children?: TreeEntry[];
}

// ============================================================
// RenamePopover
// ============================================================
function RenamePopover({
	value,
	onSave,
	onCancel,
}: {
	value: string;
	onSave: (v: string) => void;
	onCancel: () => void;
}) {
	const [text, setText] = useState(value);
	const ref = useRef<HTMLInputElement>(null);
	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);
	return (
		<HStack gap="1" onClick={(e) => e.stopPropagation()}>
			<Input
				ref={ref}
				size="xs"
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") onSave(text);
					if (e.key === "Escape") onCancel();
				}}
				bg="var(--wc-bg-card)"
				borderColor="var(--wc-border-hover)"
				color="var(--wc-text-primary)"
				fontSize="12px"
				h="26px"
				px="2"
			/>
			<Box
				cursor="pointer"
				onClick={() => onSave(text)}
				opacity={0.5}
				_hover={{ opacity: 0.8 }}
				p="1"
			>
				<CheckIcon size={11} />
			</Box>
			<Box cursor="pointer" onClick={onCancel} opacity={0.3} _hover={{ opacity: 0.6 }} p="1">
				<XIcon size={11} />
			</Box>
		</HStack>
	);
}

// ============================================================
// ConfirmDialog
// ============================================================
function ConfirmDialog({
	message,
	onConfirm,
	onCancel,
}: {
	message: string;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<Box
			position="fixed"
			top="0"
			left="0"
			right="0"
			bottom="0"
			bg="var(--wc-overlay-modal)"
			zIndex={100}
			display="flex"
			alignItems="center"
			justifyContent="center"
			onClick={onCancel}
		>
			<Box
				bg="var(--wc-bg-elevated)"
				borderWidth="1px"
				borderColor="var(--wc-border-overlay)"
				borderRadius="lg"
				p="5"
				maxW="360px"
				w="90%"
				onClick={(e) => e.stopPropagation()}
			>
				<Text fontSize="13px" color="var(--wc-text-primary)" mb="4">
					{message}
				</Text>
				<HStack justify="flex-end" gap="2">
					<Box
						as="button"
						px="3"
						py="1.5"
						borderRadius="md"
						fontSize="12px"
						bg="var(--wc-bg-card)"
						color="var(--wc-text-secondary)"
						_hover={{ bg: "var(--wc-bg-active)" }}
						onClick={onCancel}
					>
						Cancel
					</Box>
					<Box
						as="button"
						px="3"
						py="1.5"
						borderRadius="md"
						fontSize="12px"
						bg="var(--wc-accent-red-alt)"
						color="var(--wc-special-white)"
						_hover={{ bg: "var(--wc-accent-red)" }}
						onClick={onConfirm}
					>
						Delete
					</Box>
				</HStack>
			</Box>
		</Box>
	);
}

// ============================================================
// Context — Thread actions (avoids prop drilling through tree)
// ============================================================
interface ThreadActions {
	onRenameThread: (id: string, title: string) => void;
	onDeleteThread: (id: string) => void;
	onSetStarred: (id: string, starred: boolean) => void;
	onSelectThread: (id: string) => void;
	onRenameFolder: (id: string, name: string) => void;
	onDeleteFolder: (id: string) => void;
}
const ThreadActionsContext = React.createContext<ThreadActions | null>(null);

// ============================================================
// TreeNode — Pure dispatcher (no state)
// ============================================================
function TreeNode({ node }: { node: TreeEntry }) {
	return (
		<Box w="full">
			{node.type === "thread" ? <ThreadNode node={node} /> : <FolderNode node={node} />}
		</Box>
	);
}

// ============================================================
// ThreadNode
// ============================================================
function ThreadNode({ node }: { node: TreeEntry }) {
	const thread = useStore((s) => s.threads[node.id]);
	if (!thread) return null;

	const [expanded, setExpanded] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const getAnchorRect = useCallback(
		() => triggerRef.current?.getBoundingClientRect(),
		[triggerRef],
	);
	const currentThreadId = useStore((s) => s.currentThreadId);
	const selected = thread.id === currentThreadId;
	const actions = React.useContext(ThreadActionsContext);

	const metaFields = useMemo(() => {
		try {
			const m = JSON.parse(thread.meta);
			return {
				starred: !!m.starred,
				serverId: m.serverId ?? null,
				tags: m.tags ?? [],
				enableAutoEmbed: !!m.enableAutoEmbed,
			};
		} catch {
			return { starred: false, serverId: null, tags: [], enableAutoEmbed: false };
		}
	}, [thread.meta]);

	const containerId = node.parentId;
	const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

	useLayoutEffect(() => {
		setPortalTarget(
			document.getElementById(`${containerId}-${metaFields.starred ? "starred" : "default"}`),
		);
	}, [containerId, metaFields.starred]);

	const handleSelect = useCallback(() => {
		const folderId = thread.folderId;
		if (folderId) {
			fetchWorkspace(folderId).then((res) => {
				if (res.ok && res.data) useStore.getState().setWorkspace(res.data);
			});
			useStore.getState().setActiveWorkspaceId(folderId);
		}
		actions?.onSelectThread(node.id);
	}, [thread.folderId, node.id, actions]);

	const displayText = useMemo(() => {
		const total = (thread.totalPromptTokens ?? 0) + (thread.totalCompletionTokens ?? 0);
		if (total > 0) return `${(total / 1000).toFixed(1)}k`;
		if ((thread.messageCount ?? 0) > 0) return `${thread.messageCount ?? 0} msg`;
		return "empty";
	}, [thread.totalPromptTokens, thread.totalCompletionTokens, thread.messageCount]);

	if (!portalTarget) return null;

	return createPortal(
		<Box w="100%">
			<Box
				w="100%"
				className={`group ${selected ? "selected" : ""}`}
				bg={selected ? "var(--wc-bg-card)" : undefined}
				border={selected ? "1px solid var(--wc-border-strong)" : undefined}
				onClick={handleSelect}
				style={{ minHeight: "32px", cursor: "pointer" }}
				display="flex"
				alignItems="center"
				gap="1"
				borderRadius="lg"
				px="3"
				py="1"
				_hover={{ bg: "var(--wc-bg-hover)" }}
				overflow="hidden"
			>
				{node.children && node.children.length > 0 && (
					<Box
						as="button"
						onClick={(e) => {
							e.stopPropagation();
							setExpanded(!expanded);
						}}
						style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
						p="0.5"
						_hover={{ bg: "var(--wc-bg-hover)" }}
						borderRadius="sm"
					>
						{expanded ? (
							<ChevronDownIcon size={12} style={{ color: "var(--wc-text-muted)" }} />
						) : (
							<ChevronRightIcon size={12} style={{ color: "var(--wc-text-muted)" }} />
						)}
					</Box>
				)}

				{renaming ? (
					<Box flex="1" px="2" py="1">
						<RenamePopover
							value={thread.title}
							onSave={(v) => {
								actions?.onRenameThread(thread.id, v);
								setRenaming(false);
							}}
							onCancel={() => setRenaming(false)}
						/>
					</Box>
				) : (
					<>
						<Box flex="1" display="flex" flexDirection="column" overflow="hidden">
							<HStack>
								{metaFields.starred && (
									<IoStarSharp
										size={12}
										style={{ color: "var(--wc-text-secondary)", flexShrink: 0 }}
									/>
								)}
								<Text
									fontSize="13px"
									color="var(--wc-text-primary)"
									overflow="hidden"
									textOverflow="ellipsis"
									whiteSpace="nowrap"
									minW={0}
								>
									{thread.title ?? "New Chat"}
								</Text>
								<Text fontSize="12px" color="var(--wc-text-faint)">
									{displayText}
								</Text>
							</HStack>
						</Box>
						<Box position="relative">
							<Menu.Root positioning={{ getAnchorRect }}>
								<Menu.Trigger asChild>
									<Box
										ref={triggerRef as any}
										as="button"
										cursor="pointer"
										p="1"
										mr="1"
										borderRadius="sm"
										opacity={0}
										className="group-hover:!opacity-50"
										_hover={{ bg: "var(--wc-bg-hover)" }}
										type="button"
										onClick={(e) => e.stopPropagation()}
									>
										<MoreHorizontalIcon
											size={13}
											style={{ color: "var(--wc-text-muted)" }}
										/>
									</Box>
								</Menu.Trigger>
								<Menu.Positioner>
									<Menu.Content
										bg="var(--wc-bg-elevated)"
										borderWidth="1px"
										borderColor="var(--wc-border-overlay)"
										borderRadius="md"
										py="1"
										minW="120px"
										onClick={(e) => e.stopPropagation()}
									>
										<Menu.Item
											value="rename"
											onClick={() => setRenaming(true)}
											style={{
												fontSize: "12px",
												color: "var(--wc-text-primary)",
											}}
										>
											<HStack gap="2">
												<PencilIcon size={12} />
												<Text>Rename</Text>
											</HStack>
										</Menu.Item>
										<Menu.Item
											value="star"
											onClick={() =>
												actions?.onSetStarred(
													thread.id,
													!metaFields.starred,
												)
											}
											style={{
												fontSize: "12px",
												color: "var(--wc-text-primary)",
											}}
										>
											<HStack gap="2">
												<IoStarSharp
													size={12}
													style={{ color: "var(--wc-text-primary)" }}
												/>
												<Text>
													{metaFields.starred ? "Unstar" : "Star"}
												</Text>
											</HStack>
										</Menu.Item>
										<Menu.Item
											value="delete"
											onClick={() => actions?.onDeleteThread(thread.id)}
											style={{
												fontSize: "12px",
												color: "var(--wc-accent-red)",
											}}
										>
											<HStack gap="2">
												<TrashIcon size={12} />
												<Text>Delete</Text>
											</HStack>
										</Menu.Item>
									</Menu.Content>
								</Menu.Positioner>
							</Menu.Root>
						</Box>
					</>
				)}
			</Box>

			{expanded && node.children && node.children.length > 0 && (
				<Box
					pl="4"
					my="1"
					maxH="600px"
					overflowY="auto"
					css={{
						"&::-webkit-scrollbar": { width: "4px" },
						"&::-webkit-scrollbar-thumb": {
							background: "var(--wc-text-disabled)",
							borderRadius: "2px",
						},
					}}
				>
					{node.children
						.filter((c) => c.type === "folder")
						.map((child) => (
							<TreeNode key={child.id} node={child} />
						))}
					<div id={`${node.id}-starred`} style={{ width: "100%" }} />
					<div id={`${node.id}-default`} style={{ width: "100%" }} />
					{node.children
						.filter((c) => c.type === "thread")
						.map((child) => (
							<TreeNode key={child.id} node={child} />
						))}
				</Box>
			)}
		</Box>,
		portalTarget,
	);
}

// ============================================================
// FolderNode
// ============================================================
function FolderNode({ node }: { node: TreeEntry }) {
	const folder = useStore((s) => s.folders.find((f) => f.id === node.id));
	if (!folder) return null;

	const [expanded, setExpanded] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const getAnchorRect = useCallback(
		() => triggerRef.current?.getBoundingClientRect(),
		[triggerRef],
	);
	const actions = React.useContext(ThreadActionsContext);
	const setActiveWorkspaceId = useStore((s) => s.setActiveWorkspaceId);
	const setCurrentThreadId = useStore((s) => s.setCurrentThreadId);
	const setWorkspace = useStore((s) => s.setWorkspace);

	const handleToggle = useCallback(() => {
		if (!expanded) {
			fetchWorkspace(folder.id).then((res) => {
				if (res.ok && res.data) setWorkspace(res.data);
			});
			setActiveWorkspaceId(folder.id);
			setCurrentThreadId(globalThis.crypto.randomUUID());
		}
		setExpanded(!expanded);
	}, [folder.id, expanded, setExpanded, setWorkspace, setActiveWorkspaceId, setCurrentThreadId]);

	const threadCount = useMemo(() => {
		const allThreads = Object.values(useStore.getState().threads) as IChatThread[];
		return allThreads.filter((t) => t.folderId === folder.id).length;
	}, [folder.id]);

	return (
		<Box
			w="full"
			my="1"
			borderRadius="lg"
			border="1px solid var(--wc-border-default)"
			bg="var(--wc-bg-subtle)"
			transition="background 0.15s"
		>
			<HStack
				gap="1"
				px="2"
				py="1.5"
				cursor="pointer"
				borderRadius="md"
				position="relative"
				_hover={{ bg: "var(--wc-bg-card)" }}
				onClick={handleToggle}
			>
				{expanded ? (
					<ChevronDownIcon
						size={12}
						style={{ flexShrink: 0, color: "var(--wc-text-muted)" }}
					/>
				) : (
					<ChevronRightIcon
						size={12}
						style={{ flexShrink: 0, color: "var(--wc-text-muted)" }}
					/>
				)}
				{expanded ? (
					<FolderOpenIcon
						size={14}
						style={{ flexShrink: 0, color: "var(--wc-text-muted)" }}
					/>
				) : (
					<FolderIcon
						size={14}
						style={{ flexShrink: 0, color: "var(--wc-text-muted)" }}
					/>
				)}
				{renaming ? (
					<RenamePopover
						value={folder.name}
						onSave={(v) => {
							actions?.onRenameFolder(folder.id, v);
							setRenaming(false);
						}}
						onCancel={() => setRenaming(false)}
					/>
				) : (
					<Text
						flex="1"
						fontSize="14px"
						fontWeight="500"
						color="var(--wc-text-secondary)"
						overflow="hidden"
						textOverflow="ellipsis"
						whiteSpace="nowrap"
						ml="1"
						minW={0}
					>
						{folder.name}
					</Text>
				)}
				<Text fontSize="12px" color="var(--wc-text-faint)" flexShrink={0}>
					{threadCount}
				</Text>
				<Menu.Root positioning={{ getAnchorRect }}>
					<Menu.Trigger asChild>
						<Box
							ref={triggerRef as any}
							as="button"
							opacity={0.4}
							cursor="pointer"
							p="0.5"
							className="group-hover:!opacity-100"
							_hover={{ opacity: 1, bg: "var(--wc-bg-hover)" }}
							borderRadius="sm"
							type="button"
							onClick={(e) => e.stopPropagation()}
						>
							<MoreHorizontalIcon size={12} />
						</Box>
					</Menu.Trigger>
					<Menu.Positioner>
						<Menu.Content
							bg="var(--wc-bg-elevated)"
							borderWidth="1px"
							borderColor="var(--wc-border-overlay)"
							borderRadius="md"
							py="1"
							minW="120px"
							onClick={(e) => e.stopPropagation()}
						>
							<Menu.Item
								value="rename"
								onClick={() => setRenaming(true)}
								style={{ fontSize: "12px", color: "var(--wc-text-primary)" }}
							>
								<HStack gap="2">
									<PencilIcon size={12} />
									<Text>Rename</Text>
								</HStack>
							</Menu.Item>
							<Menu.Item
								value="delete"
								onClick={() => actions?.onDeleteFolder(folder.id)}
								style={{ fontSize: "12px", color: "var(--wc-accent-red)" }}
							>
								<HStack gap="2">
									<TrashIcon size={12} />
									<Text>Delete</Text>
								</HStack>
							</Menu.Item>
						</Menu.Content>
					</Menu.Positioner>
				</Menu.Root>
			</HStack>

			{expanded && node.children && node.children.length > 0 && (
				<Box
					pl="4"
					mb="2"
					maxH="600px"
					overflowY="auto"
					css={{
						"&::-webkit-scrollbar": { width: "4px" },
						"&::-webkit-scrollbar-thumb": {
							background: "var(--wc-text-disabled)",
							borderRadius: "2px",
						},
					}}
				>
					{node.children
						.filter((c) => c.type === "folder")
						.map((child) => (
							<TreeNode key={child.id} node={child} />
						))}
					<div id={`${node.id}-starred`} style={{ width: "100%" }} />
					<div id={`${node.id}-default`} style={{ width: "100%" }} />
					{node.children
						.filter((c) => c.type === "thread")
						.map((child) => (
							<TreeNode key={child.id} node={child} />
						))}
				</Box>
			)}
		</Box>
	);
}

// ============================================================
// ThreadList — Main component
// ============================================================
export const ThreadList = React.memo(({ onOpenSearch }: { onOpenSearch?: () => void }) => {
	const api = useThreadsAndFolders();
	const [search, setSearch] = useState("");
	const [sortField, setSortField] = useState<TSortField>("updatedAt");
	const [sortDir, setSortDir] = useState<TSortDir>("desc");
	const [confirmDelete, setConfirmDelete] = useState<{
		type: "folder" | "thread";
		id: string;
	} | null>(null);

	// Stable selectors — Record and array references only change when data changes
	const threads = useStore((s) => s.threads);
	const folders = useStore((s) => s.folders);

	// Convert threads Record to array, filter + sort
	const sortedThreads = useMemo(() => {
		const arr = Object.values(threads) as IChatThread[];
		if (search) {
			arr.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));
		}
		return [...arr].sort((a, b) => {
			let cmp = 0;
			if (sortField === "updatedAt") cmp = a.updatedAt - b.updatedAt;
			else if (sortField === "createdAt") cmp = a.createdAt - b.createdAt;
			else if (sortField === "title") cmp = a.title.localeCompare(b.title);
			else if (sortField === "messageCount")
				cmp =
					(a.totalPromptTokens ?? 0) +
					(a.totalCompletionTokens ?? 0) -
					((b.totalPromptTokens ?? 0) + (b.totalCompletionTokens ?? 0));
			return sortDir === "desc" ? -cmp : cmp;
		});
	}, [threads, folders, search, sortField, sortDir]);

	// Build flat tree entries from stable selectors
	const flatEntries = useMemo((): TreeEntry[] => {
		const entries: TreeEntry[] = [];
		for (const folder of folders) {
			entries.push({ id: folder.id, parentId: "root", type: "folder" });
		}
		for (const [id, t] of Object.entries(threads)) {
			const thread = t as IChatThread;
			const parentId = thread.parentId ?? thread.folderId ?? "root";
			entries.push({ id, parentId, type: "thread" });
		}
		return entries;
	}, [threads, folders]);

	// Build tree
	const tree = useMemo(() => {
		const result = arrayToTree(flatEntries, {
			id: "id",
			parentId: "parentId",
			childrenField: "children",
			rootParentIds: { root: true },
			dataField: null,
		});
		// Sort: folders before threads at every level
		function sortChildren(nodes: TreeEntry[]) {
			nodes.sort((a, b) => {
				if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
				return 0;
			});
			for (const node of nodes) {
				if (node.children?.length) {
					sortChildren(node.children);
				}
			}
		}
		sortChildren(result);
		return result;
	}, [flatEntries]);

	// Handlers — call API, SSE updates store
	const handleRenameThread = useCallback(
		async (id: string, title: string) => {
			await api.patchThread(id, { title });
		},
		[api.patchThread],
	);

	const handleDeleteThread = useCallback((id: string) => {
		setConfirmDelete({ type: "thread", id });
	}, []);

	const handleSetStarred = useCallback(
		async (id: string, starred: boolean) => {
			await api.patchThread(id, { starred });
		},
		[api.patchThread],
	);

	const handleSelectThread = useCallback(
		(id: string) => {
			api.setCurrentThreadId(id);
		},
		[api.setCurrentThreadId],
	);

	const handleRenameFolder = useCallback(
		async (id: string, name: string) => {
			await api.patchFolder(id, { name });
		},
		[api.patchFolder],
	);

	const handleDeleteFolder = useCallback((id: string) => {
		setConfirmDelete({ type: "folder", id });
	}, []);

	const handleCreateFolder = useCallback(async () => {
		await api.addFolder("New Folder");
	}, [api.addFolder]);

	const handleConfirmDelete = useCallback(async () => {
		if (!confirmDelete) return;
		if (confirmDelete.type === "thread") {
			await api.removeThread(confirmDelete.id);
		} else {
			await api.removeFolder(confirmDelete.id);
		}
		setConfirmDelete(null);
	}, [confirmDelete, api.removeThread, api.removeFolder]);

	// Context value — stable reference
	const actions = useMemo<ThreadActions>(
		() => ({
			onRenameThread: handleRenameThread,
			onDeleteThread: handleDeleteThread,
			onSetStarred: handleSetStarred,
			onSelectThread: handleSelectThread,
			onRenameFolder: handleRenameFolder,
			onDeleteFolder: handleDeleteFolder,
		}),
		[
			handleRenameThread,
			handleDeleteThread,
			handleSetStarred,
			handleSelectThread,
			handleRenameFolder,
			handleDeleteFolder,
		],
	);

	// When searching, render flat list
	if (search) {
		return (
			<ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col flex-1 min-h-0">
				<Box px="3" flex="1" overflowY="auto">
					<VStack gap="1" align="start" w="full">
						{sortedThreads.map((thread) => (
							<FlatSearchThreadItem key={thread.id} thread={thread} />
						))}
					</VStack>
				</Box>
			</ThreadListPrimitive.Root>
		);
	}

	const sortLabels = useMemo(
		() => ({
			updatedAt: "Updated",
			createdAt: "Created",
			title: "Name",
			messageCount: "Tokens",
		}),
		[],
	);

	const cycleSortField = useCallback(() => {
		const fields: TSortField[] = ["updatedAt", "createdAt", "title", "messageCount"];
		const idx = fields.indexOf(sortField);
		setSortField(fields[(idx + 1) % fields.length]!);
	}, [sortField]);

	return (
		<ThreadActionsContext.Provider value={actions}>
			<ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col flex-1 min-h-0">
				{onOpenSearch && (
					<Box flexShrink={0} mb="2" px="3">
						<Box
							as="button"
							w="full"
							px="3"
							py="2"
							borderRadius="md"
							borderWidth="1px"
							borderColor="var(--wc-border-subtle)"
							bg="var(--wc-bg-card)"
							color="var(--wc-text-muted)"
							_hover={{ bg: "var(--wc-bg-hover)", color: "var(--wc-text-primary)" }}
							display="flex"
							alignItems="center"
							justifyContent="center"
							gap="2"
							fontSize="13px"
							cursor="pointer"
							onClick={onOpenSearch}
						>
							<SearchIcon size={15} />
							<Text>Search</Text>
						</Box>
					</Box>
				)}

				<HStack
					px="3"
					gap="1"
					mb="2"
					justify="space-between"
					alignItems="center"
					flexShrink={0}
				>
					<HStack gap="1">
						<Box
							as="button"
							px="2.5"
							py="1"
							borderRadius="md"
							fontSize="12px"
							color="var(--wc-text-muted)"
							bg="var(--wc-bg-subtle)"
							_hover={{ bg: "var(--wc-bg-hover)" }}
							onClick={cycleSortField}
							title="Click to change sort field"
						>
							{sortLabels[sortField]}
						</Box>
						<Box
							as="button"
							p="1"
							borderRadius="md"
							color="var(--wc-text-faint)"
							_hover={{ color: "var(--wc-text-tertiary)" }}
							onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
							title={sortDir === "desc" ? "Newest first" : "Oldest first"}
						>
							{sortDir === "desc" ? (
								<SortDescIcon size={16} />
							) : (
								<SortAscIcon size={16} />
							)}
						</Box>
					</HStack>
					<HStack gap="1">
						<Box
							as="button"
							p="1"
							borderRadius="md"
							color="var(--wc-text-faint)"
							_hover={{ color: "var(--wc-text-secondary)" }}
							onClick={handleCreateFolder}
							title="New folder"
							mt="1"
						>
							<FolderPlusIcon size={16} />
						</Box>
					</HStack>
				</HStack>

				{/* Tree rendering */}
				<Box
					w="full"
					px="3"
					flex="1"
					overflowY="auto"
					overflowX="hidden"
					css={{
						"&::-webkit-scrollbar": { width: "4px" },
						"&::-webkit-scrollbar-thumb": {
							background: "var(--wc-text-disabled)",
							borderRadius: "2px",
						},
					}}
					borderTop="1px solid var(--wc-border-subtle)"
					pt="2"
				>
					<VStack align="start" gap="0" w="full">
						{tree
							.filter((n) => n.type === "folder")
							.map((node) => (
								<TreeNode key={node.id} node={node} />
							))}
						<div id="root-starred" style={{ width: "100%" }} />
						<div id="root-default" style={{ width: "100%" }} />
						{tree
							.filter((n) => n.type === "thread")
							.map((node) => (
								<TreeNode key={node.id} node={node} />
							))}
					</VStack>
				</Box>

				{confirmDelete && (
					<Portal>
						<ConfirmDialog
							message={
								confirmDelete.type === "folder"
									? "Delete this folder? Threads inside will be moved to root."
									: "Delete this thread? This cannot be undone."
							}
							onConfirm={handleConfirmDelete}
							onCancel={() => setConfirmDelete(null)}
						/>
					</Portal>
				)}
			</ThreadListPrimitive.Root>
		</ThreadActionsContext.Provider>
	);
});

// ============================================================
// FlatSearchThreadItem — Simple row for search results (no nesting)
// ============================================================
function FlatSearchThreadItem({ thread }: { thread: IChatThread }) {
	const currentThreadId = useStore((s) => s.currentThreadId);
	const setCurrentThreadId = useStore((s) => s.setCurrentThreadId);
	const selected = thread.id === currentThreadId;

	const handleSelect = useCallback(() => {
		const folderId = thread.folderId;
		if (folderId) {
			fetchWorkspace(folderId).then((res) => {
				if (res.ok && res.data) useStore.getState().setWorkspace(res.data);
			});
			useStore.getState().setActiveWorkspaceId(folderId);
		}
		setCurrentThreadId(thread.id);
	}, [thread.folderId, thread.id, setCurrentThreadId]);

	const displayText = useMemo(() => {
		const total = (thread.totalPromptTokens ?? 0) + (thread.totalCompletionTokens ?? 0);
		if (total > 0) return `${(total / 1000).toFixed(1)}k`;
		if ((thread.messageCount ?? 0) > 0) return `${thread.messageCount ?? 0} msg`;
		return "empty";
	}, [thread.totalPromptTokens, thread.totalCompletionTokens, thread.messageCount]);

	return (
		<Box
			w="100%"
			className={`group ${selected ? "selected" : ""}`}
			bg={selected ? "var(--wc-bg-card)" : undefined}
			border={selected ? "1px solid var(--wc-border-strong)" : undefined}
			onClick={handleSelect}
			style={{ minHeight: "32px", cursor: "pointer" }}
			display="flex"
			alignItems="center"
			gap="1"
			borderRadius="lg"
			px="3"
			py="1"
			_hover={{ bg: "var(--wc-bg-hover)" }}
			overflow="hidden"
		>
			<Box flex="1" display="flex" flexDirection="column" overflow="hidden">
				<HStack>
					<Text
						fontSize="13px"
						color="var(--wc-text-primary)"
						overflow="hidden"
						textOverflow="ellipsis"
						whiteSpace="nowrap"
						minW={0}
					>
						{thread.title ?? "New Chat"}
					</Text>
					<Text fontSize="12px" color="var(--wc-text-faint)">
						{displayText}
					</Text>
				</HStack>
			</Box>
		</Box>
	);
}
