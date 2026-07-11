import { Box, Text, HStack, VStack, Flex, Input, Button, Combobox, createListCollection, Portal, type ListCollection } from '@chakra-ui/react';
import { FolderOpen, Plus, Trash2, FolderInput } from 'lucide-react';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import type { ComboboxItem } from './settings-general';

// --- ModelDirsSection ---

export function ModelDirsSection({
	modelRoots, setModelRoots, newRoot, setNewRoot, deletingRootIndex, setDeletingRootIndex,
	handleAddRoot, handleRemoveRoot, confirmDeleteRoot, handleBrowseDirectory, t, dirtySetter
}: {
	modelRoots: string[];
	setModelRoots: (val: string[]) => void;
	newRoot: string;
	setNewRoot: (val: string) => void;
	deletingRootIndex: number | null;
	setDeletingRootIndex: (val: number | null) => void;
	handleAddRoot: () => void;
	handleRemoveRoot: (idx: number) => void;
	confirmDeleteRoot: (idx: number) => void;
	handleBrowseDirectory: () => Promise<void>;
	t: (key: string) => string;
	onConfirmDelete: (idx: number, fn: () => void) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
}) {
	return (
		<>
			<Card>
				<VStack align="stretch" gap="4">
					<Box>
						<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.modelDirectories')}</Text>
						<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.modelDirs')}</Text>
					</Box>
					<VStack align="stretch" gap="2">
						{modelRoots.map((root, idx) => (
							<HStack key={idx} gap="2">
								<Flex w="8" h="8" borderRadius="md" alignItems="center" justifyContent="center" bg="var(--wc-bg-surface)" flexShrink={0}>
									<FolderOpen size={14} color="var(--wc-text-secondary)" />
								</Flex>
								<Input value={root} readOnly size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" />
								<Button size="sm" variant="ghost" color="var(--wc-text-faint)" _hover={{ color: 'var(--wc-accent-red-alt)', bg: 'var(--wc-accent-red-bg-12)' }} borderRadius="md" minW="8" px="0" onClick={() => confirmDeleteRoot(idx)}>
									<Trash2 size={14} />
								</Button>
							</HStack>
						))}
						<HStack gap="2">
							<Input
								placeholder={t('placeholders.modelPath')} size="sm" bg="var(--wc-bg-card)"
								borderColor="var(--wc-border-default)" color="var(--wc-text-primary)"
								fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg"
								_placeholder={{ color: 'var(--wc-text-placeholder)' }}
								_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
								value={newRoot} onChange={e => dirtySetter(setNewRoot, e.target.value)}
								onKeyDown={e => e.key === 'Enter' && handleAddRoot()}
							/>
							<Button size="sm" variant="ghost" color="var(--wc-text-secondary)" _hover={{ color: 'var(--wc-accent-purple)', bg: 'var(--wc-accent-purple-hover-bg)' }} borderRadius="lg" minW="8" px="0" onClick={handleBrowseDirectory} title={t('actions.browseDirectory')}>
								<FolderInput size={14} />
							</Button>
							<Button size="sm" variant="ghost" color="var(--wc-text-secondary)" _hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-10)' }} borderRadius="lg" onClick={handleAddRoot} disabled={!newRoot.trim()}>
								<Plus size={14} />
							</Button>
						</HStack>
					</VStack>
				</VStack>
			</Card>
			<ConfirmDeleteDialog deletingRootIndex={deletingRootIndex} path={modelRoots[deletingRootIndex ?? -1] ?? ''} onCancel={() => setDeletingRootIndex(null)} onConfirm={() => { if (deletingRootIndex !== null) { confirmDeleteRoot(deletingRootIndex); setDeletingRootIndex(null); } }} t={t} />
		</>
	);
}

// --- ConfirmDeleteDialog ---

export function ConfirmDeleteDialog({ deletingRootIndex, path, onCancel, onConfirm, t }: {
	deletingRootIndex: number | null;
	path: string;
	onCancel: () => void;
	onConfirm: () => void;
	t: (key: string, params?: Record<string, unknown>) => string;
}) {
	if (deletingRootIndex === null) return null;
	return (
		<ConfirmDialog
			title={t('dialog.removeModelDirTitle')}
			message={t('dialog.removeModelDirMessage', { path })}
			isOpen={true}
			onCancel={onCancel}
			onConfirm={onConfirm}
		/>
	);
}

// --- PortRangeSection ---

export function PortRangeSection({
	portStart, setPortStart, portEnd, setPortEnd, dirtySetter, t
}: {
	portStart: number;
	setPortStart: (val: number) => void;
	portEnd: number;
	setPortEnd: (val: number) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.portRange')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.portRange')}</Text>
				</Box>
				<HStack gap="3">
					<Input value={portStart} onChange={e => dirtySetter(setPortStart, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
					<Text fontSize="13px" color="var(--wc-text-faint)">{t('units.to')}</Text>
					<Input value={portEnd} onChange={e => dirtySetter(setPortEnd, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
				</HStack>
			</VStack>
		</Card>
	);
}

// --- CheckpointsSection ---

export function CheckpointsSection({
	checkpointsPath, setCheckpointsPath, maxCheckpointDiskGB, setMaxCheckpointDiskGB, dirtySetter, t
}: {
	checkpointsPath: string | undefined;
	setCheckpointsPath: (val: string) => void;
	maxCheckpointDiskGB: number | undefined;
	setMaxCheckpointDiskGB: (val: number) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.checkpoints')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.checkpoints')}</Text>
				</Box>
				<HStack gap="3">
					<Input value={checkpointsPath} onChange={e => dirtySetter(setCheckpointsPath, e.target.value)} size="sm" flex="1" placeholder={t('placeholders.checkpointsPath')} bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
				</HStack>
				<HStack gap="3">
					<Text fontSize="13px" color="var(--wc-text-secondary)">{t('sections.maxDiskUsage')}</Text>
					<Input value={maxCheckpointDiskGB} onChange={e => dirtySetter(setMaxCheckpointDiskGB, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
					<Text fontSize="13px" color="var(--wc-text-muted)">{t('units.gb')}</Text>
				</HStack>
			</VStack>
		</Card>
	);
}
