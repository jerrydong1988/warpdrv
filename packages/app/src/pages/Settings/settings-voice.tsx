import { Box, Text, HStack, VStack, Button, Combobox, createListCollection, Portal, Slider, NativeSelect, type ListCollection, Switch } from '@chakra-ui/react';
import { ChevronDown, Mic } from 'lucide-react';
import { Card } from '../../components/Card';
import { KeyCapture } from '../../components/KeyCapture';
import type { ComboboxItem } from './settings-general';

// --- VoiceInputSection ---

export function VoiceInputSection({
	micDeviceId, setMicDeviceId, micDevices, micPermissionGranted, handleGrantMicPermission, dirtySetter, t
}: {
	micDeviceId: string;
	setMicDeviceId: (val: string) => void;
	micDevices: Array<{ id: string; label: string }>;
	micPermissionGranted: boolean;
	handleGrantMicPermission: () => Promise<void>;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.voiceInput')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.voiceInput')}</Text>
				</Box>
				{!micPermissionGranted ? (
					<Button bg="var(--wc-accent-blue-bg-15)" color="var(--wc-accent-blue)" _hover={{ bg: 'var(--wc-accent-blue-bg-25)' }} borderRadius="lg" onClick={handleGrantMicPermission}>
						<Mic size={15} />{t('actions.grantMicAccess')}
					</Button>
				) : micDevices.length === 0 ? (
					<Text fontSize="12px" color="var(--wc-text-faint)">{t('options.noMicDevices')}</Text>
				) : (
					<NativeSelect.Root defaultValue={micDeviceId}>
						<NativeSelect.Field
							bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)"
							color="var(--wc-text-primary)" fontSize="13px" borderRadius="lg"
							onChange={(e) => dirtySetter(setMicDeviceId, (e.target as unknown as HTMLSelectElement).value)}
						>
							<option value="">{t('options.defaultMicrophone')}</option>
							{micDevices.map(d => (<option key={d.id} value={d.id}>{d.label}</option>))}
						</NativeSelect.Field>
					</NativeSelect.Root>
				)}
			</VStack>
		</Card>
	);
}

// --- VoiceOutputSection ---

export function VoiceOutputSection({
	voiceCollection, kokoroVoice, setKokoroVoice, kokoroSpeed, setKokoroSpeed, dirtySetter, t
}: {
	voiceCollection: ListCollection<ComboboxItem>;
	kokoroVoice: string;
	setKokoroVoice: (val: string) => void;
	kokoroSpeed: number;
	setKokoroSpeed: (val: number) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.voiceOutput')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.voiceOutput')}</Text>
				</Box>
				<Combobox.Root collection={voiceCollection} value={[kokoroVoice]} onValueChange={(details) => dirtySetter(setKokoroVoice, details.value?.[0] as string || 'af_heart')}>
					<Combobox.Control>
						<Combobox.Trigger asChild>
							<Button variant="outline" size="sm" justifyContent="space-between" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontSize="13px" borderRadius="lg" fontWeight="500">
								{voiceCollection.items.find(i => i.value === kokoroVoice)?.label ?? t('options.defaultVoice')}
								<ChevronDown size={14} />
							</Button>
						</Combobox.Trigger>
					</Combobox.Control>
					<Portal>
						<Combobox.Positioner>
							<Combobox.Content bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1">
								{voiceCollection.items.map((item) => (
									<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer" _hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-bg-active)' }}>
										<Text fontSize="12px" color="var(--wc-text-primary)">{item.label}</Text>
										<Combobox.ItemIndicator />
									</Combobox.Item>
								))}
							</Combobox.Content>
						</Combobox.Positioner>
					</Portal>
				</Combobox.Root>
				<VStack align="stretch" gap="2">
					<HStack justify="space-between">
						<Text fontSize="11px" color="var(--wc-text-muted)">{t('options.ttsSpeed')}</Text>
						<Text fontSize="11px" color="var(--wc-text-tertiary)">{kokoroSpeed.toFixed(1)}x</Text>
					</HStack>
					<Slider.Root w="full" size="sm" colorPalette="blue" value={[kokoroSpeed]} min={0.5} max={3} step={0.1} onValueChange={(details) => dirtySetter(setKokoroSpeed, details.value[0])}>
						<Slider.Control>
							<Slider.Track><Slider.Range /></Slider.Track>
							<Slider.Thumbs />
						</Slider.Control>
					</Slider.Root>
				</VStack>
			</VStack>
		</Card>
	);
}

// --- DictationSection ---

export function DictationSection({
	dictationPTTKey, setDictationPTTKey, dictationPTTModeHold, setDictationPTTModeHold, dirtySetter, t
}: {
	dictationPTTKey: string;
	setDictationPTTKey: (val: string) => void;
	dictationPTTModeHold: boolean;
	setDictationPTTModeHold: (val: boolean) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.dictation')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.dictation')}</Text>
				</Box>
				<KeyCapture value={dictationPTTKey} onChange={(key) => dirtySetter(setDictationPTTKey, key)} onDisable={() => dirtySetter(setDictationPTTKey, '')} />
				<HStack gap="3" align="center">
					<Text fontSize="13px" color="var(--wc-text-secondary)">{t('sections.holdMode')}</Text>
					<Switch.Root checked={dictationPTTModeHold} onCheckedChange={(details: { checked: boolean }) => dirtySetter(setDictationPTTModeHold, details.checked)}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: dictationPTTModeHold ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
					</Switch.Root>
					<Text fontSize="12px" color="var(--wc-text-muted)">{dictationPTTModeHold ? t('switches.pttHold') : t('switches.pttToggle')}</Text>
				</HStack>
			</VStack>
		</Card>
	);
}
