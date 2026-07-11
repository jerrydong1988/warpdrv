import { nanoid } from 'nanoid';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { Box, Button, Flex, IconButton, Popover, Portal, Switch, Slider, HStack, Text, VStack, Combobox, createListCollection } from '@chakra-ui/react';
import { MessageSquare, ChevronDown, Plus } from 'lucide-react';
import { VscLayoutSidebarLeft, VscLayoutSidebarLeftOff, VscLayoutSidebarRight, VscLayoutSidebarRightOff } from 'react-icons/vsc';
import { RiFontSize } from 'react-icons/ri';
import { PageHeader } from '@/components/PageHeader';
import { updateSettings } from '@/api/services';
import { useHotkey, HotkeyMode } from '@/hooks/useHotKey';
import { useLocation } from 'react-router-dom';
import { EChatSidebarTab } from '@/store/slices/chatSidebar';

interface IChatPageHeaderProps {
	onNewChat: () => void;
	onToggleThreadsList: () => void;
	threadsListCollapsed: boolean;
	onToggleSidebar: () => void;
	sidebarOpen: boolean;
}

export function ChatPageHeader({ onNewChat, onToggleThreadsList, threadsListCollapsed, onToggleSidebar, sidebarOpen }: IChatPageHeaderProps) {
	const { t } = useTranslation('chat');
	const title = useStore(s => s.currentThreadId ? s.threads[s.currentThreadId]?.title || t('actions.newChat') : t('actions.newChat'));
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const openChatSidebarTab = useStore(s => s.openChatSidebarTab);
	const location = useLocation();
	const currentPath = location.pathname;

	const chatFontSize = useStore(s => s.settings.chatFontSize ?? 14);
	const chatFontFamily = useStore(s => s.settings.chatFontFamily ?? '');
	const chatFixedWidth = useStore(s => s.settings.chatFixedWidth ?? false);

	const fontFamilyCollection = createListCollection({
		items: [
			{ label: 'Inter', value: 'Inter Variable, sans-serif' },
			{ label: 'Geist', value: '"Geist", sans-serif' },
			{ label: 'Geist Mono', value: '"Geist Mono", monospace' },
			{ label: 'Arial', value: 'Arial, sans-serif' },
			{ label: 'Verdana', value: 'Verdana, sans-serif' },
			{ label: 'Georgia', value: 'Georgia, serif' },
			{ label: 'Times New Roman', value: '"Times New Roman", serif' },
			{ label: 'Courier New', value: '"Courier New", monospace' },
		],
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});

	useHotkey(
		{
			keys: [{ ControlLeft: true, KeyF: true }, { ControlRight: true, KeyF: true }, { MetaLeft: true, KeyF: true }, { MetaRight: true, KeyF: true }],
			mode: HotkeyMode.KEYPRESS,
			target: window,
			isEnabled: currentPath === '/chat'
		},
		{
			onActivate: () => {
				openChatSidebarTab(EChatSidebarTab.SEARCH);
				setTimeout(() => {
					const input = document.querySelector('#chat-thread-search-input') as HTMLInputElement | null;
					input?.focus();
				}, 50);
			},
		}
	);

	const titleOffset = threadsListCollapsed ? -20 : 100;

	return (
		<PageHeader
			title="Chat"
			icon={<MessageSquare size={20} />}
			actionsRight={
				<>
					<Popover.Root>
						<Popover.Trigger asChild>
							<IconButton
								aria-label="Chat settings"
								variant="ghost"
								size="sm"
								borderWidth="1px"
								borderColor="var(--wc-border-default)"
								borderRadius="lg"
								color="var(--wc-text-secondary)"
								_hover={{ color: 'var(--wc-text-heading)', bg: 'var(--wc-bg-active)' }}
							>
								<RiFontSize size={20} />
							</IconButton>
						</Popover.Trigger>
						<Portal>
							<Popover.Positioner>
								<Popover.Content
									w="260px"
									bg="var(--wc-bg-elevated)"
									borderWidth="1px"
									borderColor="var(--wc-border-default)"
									borderRadius="lg"
									shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
								>
									<Popover.Arrow>
										<Popover.ArrowTip bg="var(--wc-bg-elevated)" borderColor="var(--wc-border-default)" />
									</Popover.Arrow>
									<Popover.Body p="3">
										<VStack align="stretch" gap="3">
											<Text fontSize="12px" fontWeight="600" color="var(--wc-text-heading)">Chat Appearance</Text>

											<VStack align="stretch" gap="2">
												<HStack justify="space-between">
													<Text fontSize="11px" color="var(--wc-text-muted)">Font Size</Text>
													<Text fontSize="11px" color="var(--wc-text-tertiary)">{chatFontSize}px</Text>
												</HStack>
												<Slider.Root
													w="full"
													size="sm"
													colorPalette="blue"
													value={[chatFontSize]}
													min={10}
													max={32}
													onValueChange={(details) => updateSettings({ chatFontSize: details.value[0] })}
												>
													<Slider.Control>
														<Slider.Track>
															<Slider.Range />
														</Slider.Track>
														<Slider.Thumbs />
													</Slider.Control>
												</Slider.Root>
											</VStack>

											<VStack align="stretch" gap="2">
												<Text fontSize="11px" color="var(--wc-text-muted)">Font Family</Text>
												<Combobox.Root
													collection={fontFamilyCollection}
													value={[chatFontFamily || '']}
													onValueChange={(details) => updateSettings({ chatFontFamily: details.value?.[0] || '' })}
												>
													<Combobox.Control>
														<Combobox.Trigger asChild>
															<Button
																variant="outline"
																size="sm"
																justifyContent="space-between"
																bg="var(--wc-bg-card)"
																borderColor="var(--wc-border-default)"
																color="var(--wc-text-primary)"
																fontSize="12px"
																borderRadius="md"
																fontWeight="500"
															>
																{chatFontFamily ? (fontFamilyCollection.items.find(i => i.value === chatFontFamily)?.label || 'Default (Inter)') : 'Default (Inter)'}
																<ChevronDown size={12} />
															</Button>
														</Combobox.Trigger>
													</Combobox.Control>
													<Portal>
														<Combobox.Positioner>
															<Combobox.Content
																bg="var(--wc-bg-elevated)"
																borderWidth="1px"
																borderColor="var(--wc-border-default)"
																borderRadius="md"
																shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
																p="1"
																maxH="200px"
																overflowY="auto"
															>
																<Combobox.Item item={{ label: 'Default (Inter)', value: '' }} px="2" py="1.5" borderRadius="sm" cursor="pointer" _hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-bg-active)' }}>
																	<Text fontSize="11px" color="var(--wc-text-primary)">Default (Inter)</Text>
																	<Combobox.ItemIndicator />
																</Combobox.Item>
																{fontFamilyCollection.items.map((item) => (
																	<Combobox.Item key={item.value} item={item} px="2" py="1.5" borderRadius="sm" cursor="pointer" _hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-bg-active)' }}>
																		<Text fontSize="11px" color="var(--wc-text-primary)">{item.label}</Text>
																		<Combobox.ItemIndicator />
																	</Combobox.Item>
																))}
															</Combobox.Content>
														</Combobox.Positioner>
													</Portal>
												</Combobox.Root>
											</VStack>

											<Switch.Root label="Fixed chat width" checked={chatFixedWidth} onCheckedChange={(details) => updateSettings({ chatFixedWidth: details.checked })}>
												<Switch.HiddenInput />
												<Switch.Control css={{ bg: chatFixedWidth ? 'var(--wc-accent-blue)' : 'surface.4' }}>
													<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
												</Switch.Control>
												<Switch.Label ml="2" fontSize="12px" color={chatFixedWidth ? 'var(--wc-accent-blue)' : 'var(--wc-text-muted)'} userSelect="none">
													Fixed width
												</Switch.Label>
											</Switch.Root>
										</VStack>
									</Popover.Body>
								</Popover.Content>
							</Popover.Positioner>
						</Portal>
					</Popover.Root>
					<IconButton
						aria-label="Toggle right panel"
						variant="ghost"
						size="sm"
						borderWidth="1px"
						borderColor="var(--wc-border-default)"
						borderRadius="lg"
						color="var(--wc-text-secondary)"
						_hover={{ color: 'var(--wc-text-heading)', bg: 'var(--wc-bg-active)' }}
						onClick={onToggleSidebar}
					>
						{sidebarOpen ? <VscLayoutSidebarRight size={20} /> : <VscLayoutSidebarRightOff size={20} />}
					</IconButton>
				</>
			}
			actions={
				<>
					<IconButton
						aria-label="Toggle threads list"
						variant="ghost"
						size="sm"
						mr="5"
						color="var(--wc-text-secondary)"
						_hover={{ color: 'var(--wc-text-heading)', bg: 'var(--wc-bg-active)' }}
						onClick={onToggleThreadsList}
					>
						{threadsListCollapsed ? <VscLayoutSidebarLeftOff size={20} /> : <VscLayoutSidebarLeft size={20} />}
					</IconButton>
					<Button
						size="sm"
						bg="var(--wc-accent-blue-bg-12)"
						color="var(--wc-accent-blue)"
						borderWidth="1px"
						borderColor="var(--wc-accent-blue-border)"
						_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
						borderRadius="lg"
						fontSize="13px"
						fontWeight="500"
						onClick={onNewChat}
					>
						<Plus size={15} />
						New Chat
					</Button>
					<span style={{
						fontSize: "13px",
						color: "var(--wc-text-muted)",
						position: "fixed",
						left: `calc(50% - (${title.length * 3.5}px - ${titleOffset}px)`
					}}>{title}</span>
				</>
			}
		/>
	);
}
