import { Box, Text, HStack, VStack, Input, Button, Switch, createListCollection, Portal, type ListCollection } from '@chakra-ui/react';
import { ChevronDown } from 'lucide-react';
import { Plus, Trash2, FolderOpen } from 'lucide-react';
import { Card } from '../../components/Card';
import type { ComboboxItem } from './settings-general';

// --- APISection ---

export function APISection({
	apiHost, setApiHost, apiPort, setApiPort, dirtySetter, t
}: {
	apiHost: string;
	setApiHost: (val: string) => void;
	apiPort: number;
	setApiPort: (val: number) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.apiHost')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.apiHost')}</Text>
				</Box>
				<HStack gap="3">
					<Input value={apiHost} onChange={e => dirtySetter(setApiHost, e.target.value)} size="sm" w="140px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
					<Text fontSize="13px" color="var(--wc-text-faint)">:</Text>
					<Input value={apiPort} onChange={e => dirtySetter(setApiPort, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
				</HStack>
			</VStack>
		</Card>
	);
}

// --- BuiltinMcpSection ---

export function BuiltinMcpSection({
	builtinMcpPort, setBuiltinMcpPort, builtinMcpExposeExternal, setBuiltinMcpExposeExternal,
	fsAllowedRoots, setFsAllowedRoots, newFsRoot, setNewFsRoot, handleBrowseFsRoot, dirtySetter, t
}: {
	builtinMcpPort: number;
	setBuiltinMcpPort: (val: number) => void;
	builtinMcpExposeExternal: boolean;
	setBuiltinMcpExposeExternal: (val: boolean) => void;
	fsAllowedRoots: string[];
	setFsAllowedRoots: (val: string[]) => void;
	newFsRoot: string;
	setNewFsRoot: (val: string) => void;
	handleBrowseFsRoot: () => Promise<void>;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.builtinMcp')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.builtinMcp')}</Text>
				</Box>
				<HStack gap="3">
					<Text fontSize="13px" color="var(--wc-text-muted)" w="100px">{t('sections.port')}</Text>
					<Input value={builtinMcpPort} onChange={e => dirtySetter(setBuiltinMcpPort, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
				</HStack>
				<HStack gap="3">
					<Switch.Root label={t('switches.exposeExternal')} checked={builtinMcpExposeExternal} onCheckedChange={(details) => dirtySetter(setBuiltinMcpExposeExternal, details.checked)}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: builtinMcpExposeExternal ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
						<Switch.Label ml="2" fontSize="13px" userSelect="none">{t('switches.bindAll')}</Switch.Label>
					</Switch.Root>
				</HStack>
				<Box>
					<Text fontSize="13px" fontWeight="500" color="var(--wc-text-heading)" mb="1">{t('sections.fsAllowedRoots')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)" mb="2">{t('descriptions.fsAllowedRoots')}</Text>
					<VStack align="stretch" gap="2">
						{fsAllowedRoots.map((root, idx) => (
							<HStack key={idx} gap="2">
								<Input value={root} readOnly size="sm" flex="1" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" />
								<Button size="sm" variant="ghost" onClick={() => dirtySetter(setFsAllowedRoots, fsAllowedRoots.filter((_, i) => i !== idx))}>
									<Trash2 size={14} />
								</Button>
							</HStack>
						))}
						<HStack gap="2">
							<Input value={newFsRoot} onChange={e => setNewFsRoot(e.target.value)} placeholder={t('placeholders.fsRoot')} size="sm" flex="1" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" />
							<Button size="sm" variant="ghost" color="var(--wc-text-secondary)" _hover={{ color: 'var(--wc-accent-purple)', bg: 'var(--wc-accent-purple-hover-bg)' }} borderRadius="lg" minW="8" px="0" onClick={handleBrowseFsRoot} title={t('actions.browseDirectory')}>
								<FolderOpen size={14} />
							</Button>
							<Button size="sm" variant="ghost" onClick={() => {
								const p = newFsRoot.trim();
								if (!p || fsAllowedRoots.includes(p)) return;
								dirtySetter(setFsAllowedRoots, [...fsAllowedRoots, p]);
								setNewFsRoot('');
							}}>
								<Plus size={14} />
							</Button>
						</HStack>
					</VStack>
				</Box>
			</VStack>
		</Card>
	);
}

// --- RouterSection ---

export function RouterSection({
	proxyEnabled, setProxyEnabled, proxyPort, setProxyPort, dirtySetter, t
}: {
	proxyEnabled: boolean;
	setProxyEnabled: (val: boolean) => void;
	proxyPort: number;
	setProxyPort: (val: number) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<HStack justify="space-between" alignItems="center" mb="2">
					<Box flex="1">
						<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)">{t('sections.router')}</Text>
						<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.router')}</Text>
					</Box>
				</HStack>
				<HStack gap="3">
					<Switch.Root label={t('switches.startRouterOnLaunch')} checked={proxyEnabled} onCheckedChange={(details) => dirtySetter(setProxyEnabled, details.checked)}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: proxyEnabled ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
						<Switch.Label ml="2" fontSize="13px" userSelect="none">{t('switches.startRouterOnLaunch')}</Switch.Label>
					</Switch.Root>
					<Input value={proxyPort} onChange={e => dirtySetter(setProxyPort, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} disabled={!proxyEnabled} />
				</HStack>
			</VStack>
		</Card>
	);
}
