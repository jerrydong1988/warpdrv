import { useState, useCallback, useMemo } from 'react';
import { Dialog, Portal, Box, Text, HStack, VStack, Button, Spinner, Badge } from '@chakra-ui/react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { restartServer, activateBackendInGroup } from '../../api/services';
import { useStore } from '../../store';
import type { TBackendId, TBackendGroupId } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { useToast } from '../../components/ToastProvider';

interface IActivateBackendDialogProps {
	isOpen: boolean;
	onClose: () => void;
	groupId: TBackendGroupId;
	newBackendId: TBackendId;
	onComplete?: () => void;
}

interface IServerState {
	id: string;
	name: string;
	port: number;
	status: 'idle' | 'restarting' | 'completed' | 'failed';
	error?: string;
}

export function ActivateBackendDialog({ isOpen, onClose, groupId, newBackendId, onComplete }: IActivateBackendDialogProps) {
	const { t } = useTranslation('backends');
	const { toast } = useToast();
	const group = useStore((s) => s.backendGroups[groupId]);
	const backends = useStore((s) => s.backends);
	const servers = useStore((s) => s.servers);

	const [open, setOpen] = useState(isOpen);
	const [isSwitching, setIsSwitching] = useState(false);
	const [switchingDone, setSwitchingDone] = useState(false);
	const [isRestarting, setIsRestarting] = useState(false);

	const newBackend = useMemo(() => backends[newBackendId], [backends, newBackendId]);
	const currentBackend = useMemo(() => group ? backends[group.activeBackendId] : undefined, [group, backends]);

	const affectedServers = useMemo(() => {
		if (!group) return [];
		return Object.values(servers).filter(s => s.backendGroupId === group.id && s.status === EServerStatus.RUNNING);
	}, [group, servers]);

	const [serversState, setServersState] = useState<Record<string, IServerState>>(
		affectedServers.reduce((acc, s) => ({
			...acc,
			[s.id]: { id: s.id, name: s.serverName, port: s.port, status: 'idle' } as IServerState,
		}), {})
	);

	const handleClose = useCallback(() => {
		setOpen(false);
		onClose();
	}, [onClose]);

	const handleCancel = useCallback(() => {
		handleClose();
	}, [handleClose]);

	const handleSwitchOnly = async () => {
		setIsSwitching(true);
		try {
			const result = await activateBackendInGroup(groupId, newBackendId);
			if (result.ok) {
				toast('success', t('toast.backendActivated'));
				handleClose();
				onComplete?.();
			} else {
				toast('error', result.error ?? t('toast.updateActiveBackendFailed'));
				setIsSwitching(false);
			}
		} catch {
			toast('error', t('toast.updateActiveBackendFailed'));
			setIsSwitching(false);
		}
	};

	const handleSwitchAndRestart = async () => {
		setIsSwitching(true);
		setIsRestarting(true);

		try {
			const result = await activateBackendInGroup(groupId, newBackendId);
			if (!result.ok) {
				toast('error', result.error ?? t('toast.updateActiveBackendFailed'));
				setIsSwitching(false);
				setIsRestarting(false);
				return;
			}
			setSwitchingDone(true);

			if (Object.keys(serversState).length === 0) {
				toast('success', t('toast.backendActivated'));
				handleClose();
				onComplete?.();
				return;
			}

			setServersState(prev => {
				const newState: Record<string, IServerState> = {};
				for (const s of Object.values(prev)) {
					newState[s.id] = { ...s, status: 'restarting' as const };
				}
				return newState;
			});

			const restartPromises = Object.values(serversState).map(async (server) => {
				try {
					await restartServer(server.id);
					setServersState(prev => {
						const existing = prev[server.id];
						if (!existing) return prev;
						return {
							...prev,
							[server.id]: { id: existing.id, name: existing.name, port: existing.port, status: 'completed' },
						};
					});
				} catch {
					setServersState(prev => {
						const existing = prev[server.id];
						if (!existing) return prev;
						return {
							...prev,
							[server.id]: { id: existing.id, name: existing.name, port: existing.port, status: 'failed', error: t('activateDialog.restartFailed') },
						};
					});
				}
			});

			await Promise.all(restartPromises);

			toast('success', t('toast.backendActivatedAndRestarted'));
			handleClose();
			onComplete?.();
		} catch {
			toast('error', t('toast.updateActiveBackendFailed'));
			setIsSwitching(false);
			setIsRestarting(false);
		}
	};

	const allCompleted = Object.keys(serversState).length > 0 && Object.values(serversState).every(s => s.status === 'completed' || s.status === 'failed');

	return (
		<Dialog.Root open={open} onOpenChange={(details) => { if (!isSwitching && !isRestarting) setOpen(details.open); }}>
			<Portal>
				<Box position="fixed" inset="6px" borderRadius="12px" overflow="hidden" zIndex="modal">
					<Dialog.Backdrop position="absolute" />
					<Dialog.Positioner position="absolute">
						<Dialog.Content
							maxW="520px"
							bg="var(--wc-bg-dialog)"
							borderColor="var(--wc-border-default)"
							borderRadius="2xl"
						shadow="0 24px 80px rgba(0, 0, 0, 0.6)"
					>
						<VStack gap="4" px="6" py="5">
							<Box w="10" h="10" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" bg="var(--wc-accent-red-bg-12)">
								<AlertTriangle size={20} color="var(--wc-accent-red)" />
							</Box>

							<VStack gap="2">
								<Dialog.Title fontSize="16px" fontWeight="700" color="var(--wc-text-primary)">
									{t('activateDialog.title')}
								</Dialog.Title>
								<Text fontSize="13px" color="var(--wc-text-tertiary)" textAlign="center">
									{t('activateDialog.changingFrom')} <Text as="span" color="var(--wc-text-primary)" fontWeight="500">{currentBackend?.name ?? t('activateDialog.deleted')}</Text> {t('activateDialog.to')} <Text as="span" color="var(--wc-text-primary)" fontWeight="500">{newBackend?.name ?? t('activateDialog.deleted')}</Text>
								</Text>
							</VStack>

							{Object.keys(serversState).length > 0 ? (
								<Box>
									<Text fontSize="12px" color="var(--wc-text-muted)" mb="2">
										{t('activateDialog.affectedServers', { count: Object.keys(serversState).length })}:
									</Text>
									<Box
										borderWidth="1px"
										borderColor="var(--wc-border-subtle)"
										borderRadius="lg"
										p="2"
										maxH="200px"
										overflowY="auto"
									>
										<VStack gap="1" align="stretch">
											{Object.values(serversState).map((server) => (
												<HStack
													key={server.id}
													justify="space-between"
													px="2"
													py="1.5"
													borderRadius="md"
													bg={
														server.status === 'restarting'
															? 'var(--wc-accent-blue-bg-8)'
															: server.status === 'completed'
															? 'var(--wc-accent-green-bg-8)'
															: server.status === 'failed'
															? 'var(--wc-accent-red-bg-8)'
															: 'transparent'
													}
													borderWidth="1px"
													borderColor={
														server.status === 'restarting'
															? 'var(--wc-accent-blue-border)'
															: server.status === 'completed'
															? 'var(--wc-accent-green-border)'
															: server.status === 'failed'
															? 'var(--wc-accent-red-border)'
															: 'transparent'
													}
													transition="all 0.2s ease"
												>
													<HStack gap="2">
														{server.status === 'restarting' && (
															<Spinner size="xs" color="var(--wc-accent-blue)" />
														)}
														{server.status === 'completed' && (
															<CheckCircle size={14} color="var(--wc-accent-green)" />
														)}
														{server.status === 'failed' && (
															<XCircle size={14} color="var(--wc-accent-red)" />
														)}
														{server.status === 'idle' && (
															<Badge
																px="1.5"
																py="0.25"
																borderRadius="md"
																fontSize="10px"
																bg="var(--wc-bg-hover)"
																color="var(--wc-text-muted)"
															>
																Port {server.port}
															</Badge>
														)}
														<Text fontSize="12px" color={server.status === 'idle' ? 'var(--wc-text-secondary)' : 'var(--wc-text-primary)'} fontWeight={server.status === 'idle' ? '400' : '500'}>
															{server.name}
														</Text>
													</HStack>
													{server.status === 'restarting' && (
<Text fontSize="11px" color="var(--wc-accent-blue)" fontWeight="500">
														{t('activateDialog.restarting')}
													</Text>
												)}
													{server.status === 'completed' && (
														<Text fontSize="11px" color="var(--wc-accent-green)" fontWeight="500">
														{t('activateDialog.restarted')}
													</Text>
												)}
													{server.status === 'failed' && (
														<Text fontSize="11px" color="var(--wc-accent-red)" fontWeight="500">
														{t('activateDialog.failed')}
														</Text>
													)}
												</HStack>
											))}
										</VStack>
									</Box>
								</Box>
							) : (
								<Text fontSize="12px" color="var(--wc-text-muted)" textAlign="center" py="2">
									{t('activateDialog.noRunningServers')}
								</Text>
							)}

							<HStack gap="2" w="100%" pt="2">
								<Button
									flex="1"
									size="sm"
									variant="ghost"
									color="var(--wc-text-muted)"
									_hover={{ color: 'var(--wc-text-primary)', bg: 'var(--wc-bg-hover)' }}
									borderRadius="lg"
									fontSize="13px"
									onClick={handleCancel}
									disabled={isSwitching && !switchingDone}
								>
									{t('actions.cancel')}
								</Button>
								<Button
									flex="1"
									size="sm"
									bg="var(--wc-accent-purple-bg-12)"
									color="var(--wc-accent-purple)"
									borderWidth="1px"
									borderColor="var(--wc-accent-purple-border)"
									_hover={{ bg: 'var(--wc-accent-purple-hover-bg)' }}
									borderRadius="lg"
									fontSize="13px"
									fontWeight="500"
									onClick={handleSwitchOnly}
									disabled={isSwitching || switchingDone}
								>
									{isSwitching ? <Spinner size="xs" /> : t('activateDialog.switchOnly')}
								</Button>
								{affectedServers.length > 0 && (
<Button
										flex="1"
										size="sm"
										bg="var(--wc-accent-blue-bg-12)"
										color="var(--wc-accent-blue)"
										borderWidth="1px"
										borderColor="var(--wc-accent-blue-border)"
										_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
										borderRadius="lg"
										fontSize="13px"
										fontWeight="500"
										onClick={handleSwitchAndRestart}
										disabled={isSwitching || switchingDone || isRestarting}
								>
										{isRestarting ? (
											<HStack gap="1">
												<Spinner size="xs" />
												<Text>{t('activateDialog.restarting')}</Text>
											</HStack>
										) : (
											<Text>{t('activateDialog.switchAndRestart')}</Text>
										)}
									</Button>
								)}
							</HStack>
						</VStack>
					</Dialog.Content>
					</Dialog.Positioner>
				</Box>
			</Portal>
		</Dialog.Root>
	);
}
