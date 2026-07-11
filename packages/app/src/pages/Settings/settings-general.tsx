import { Box, Text, VStack, Combobox, createListCollection, Portal, Button, type ListCollection, HStack, NativeSelect, Switch, Input } from '@chakra-ui/react';
import { ChevronDown } from 'lucide-react';
import { ETheme } from '@warpcore/shared';
import { Card } from '../../components/Card';

// --- Shared: ComboboxSection ---

export interface ComboboxItem {
	label: string;
	value: string;
}

interface ComboboxSectionProps {
	t: (key: string) => string;
	sectionKey: string;
	descriptionKey: string;
	label: string;
	collection: ListCollection<ComboboxItem>;
	value: string | undefined;
	onValueChange: (val: string) => void;
	optionLabel?: (item: ComboboxItem) => string;
}

function ComboboxSection({ t, sectionKey, descriptionKey, label, collection, value, onValueChange, optionLabel }: ComboboxSectionProps) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t(sectionKey)}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t(descriptionKey)}</Text>
				</Box>
				<Combobox.Root collection={collection} value={[value ?? collection.items[0]?.value ?? '']} onValueChange={(details) => onValueChange(details.value?.[0] ?? '')}>
					<Combobox.Control>
						<Combobox.Trigger asChild>
							<Button
								variant="outline" size="sm" justifyContent="space-between"
								bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)" fontSize="13px" borderRadius="lg" fontWeight="500"
							>
								{collection.items.find(i => i.value === value)?.label ?? label}
								<ChevronDown size={14} />
							</Button>
						</Combobox.Trigger>
					</Combobox.Control>
					<Portal>
						<Combobox.Positioner>
							<Combobox.Content
								bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)"
								borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
							>
								{collection.items.map((item) => (
									<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer" _hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-bg-active)' }}>
										<Text fontSize="12px" color="var(--wc-text-primary)">{optionLabel?.(item) ?? item.label}</Text>
										<Combobox.ItemIndicator />
									</Combobox.Item>
								))}
							</Combobox.Content>
						</Combobox.Positioner>
					</Portal>
				</Combobox.Root>
			</VStack>
		</Card>
	);
}

// --- ThemeSection ---

export function ThemeSection({ localTheme, setLocalTheme, dirtySetter, t }: {
	localTheme: ETheme;
	setLocalTheme: (val: ETheme) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	const themeCollection = createListCollection({
		items: [
			{ label: 'Amoled', value: String(ETheme.AMOLED) },
			{ label: 'Catppuccin (Latte)', value: String(ETheme.CATPPUCCIN_LATTE) },
			{ label: 'Catppuccin (Mocha)', value: String(ETheme.CATPPUCCIN_MOCHA) },
			{ label: 'Dark', value: String(ETheme.DARK) },
			{ label: 'Dracula', value: String(ETheme.DRACULA_DARK) },
			{ label: 'Dracula Light', value: String(ETheme.DRACULA_LIGHT) },
			{ label: 'Everforest Hard', value: String(ETheme.EVERFOREST_HARD) },
			{ label: 'GitHub Dark', value: String(ETheme.GITHUB_DARK) },
			{ label: 'GitHub Light', value: String(ETheme.GITHUB_LIGHT) },
			{ label: 'Gruvbox', value: String(ETheme.GRUVBOX) },
			{ label: 'Gruvbox Hard', value: String(ETheme.GRUVBOX_HARD) },
			{ label: 'Kanagawa', value: String(ETheme.KANAGAWA) },
			{ label: 'Kimbie Dark', value: String(ETheme.KIMBIE_DARK) },
			{ label: 'Light', value: String(ETheme.LIGHT) },
			{ label: 'Min', value: String(ETheme.MIN) },
			{ label: 'Monokai Pro', value: String(ETheme.MONOKAI_PRO) },
			{ label: 'Nord', value: String(ETheme.NORD) },
			{ label: 'Nord Light', value: String(ETheme.NORD_LIGHT) },
			{ label: 'Obsidian', value: String(ETheme.OBSIDIAN) },
			{ label: 'One Dark', value: String(ETheme.ONE_DARK) },
			{ label: 'One Light', value: String(ETheme.ONE_LIGHT) },
			{ label: 'Palenight', value: String(ETheme.PALENIGHT) },
			{ label: "Rosé Pine", value: String(ETheme.ROSE_PINE) },
			{ label: 'Solarized Dark', value: String(ETheme.SOLARIZED_DARK) },
			{ label: 'Solarized Light', value: String(ETheme.SOLARIZED_LIGHT) },
			{ label: 'Tokyo Night', value: String(ETheme.TOKYO_NIGHT) },
			{ label: 'Tokyo Night Light', value: String(ETheme.TOKYO_NIGHT_LIGHT) },
			{ label: 'Vesper', value: String(ETheme.VESPER) },
		].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});
	return (
		<ComboboxSection
			t={t} sectionKey="sections.theme" descriptionKey="descriptions.theme" label="Dark"
			collection={themeCollection} value={String(localTheme)}
			onValueChange={(val) => {
				const theme = Object.values(ETheme).find(v => String(v) === val);
				if (theme) dirtySetter(setLocalTheme, theme);
			}}
		/>
	);
}

// --- LanguageSection ---

export function LanguageSection({ locale, setLocale, dirtySetter, setI18nLocale, t }: {
	locale: 'en' | 'zh-CN' | undefined;
	setLocale: (val: 'en' | 'zh-CN') => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	setI18nLocale: (val: 'en' | 'zh-CN') => void;
	t: (key: string) => string;
}) {
	const languageCollection = createListCollection({
		items: [{ label: 'English', value: 'en' }, { label: '简体中文', value: 'zh-CN' }],
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});
	return (
		<ComboboxSection
			t={t} sectionKey="sections.language" descriptionKey="descriptions.language" label="English"
			collection={languageCollection} value={locale ?? 'en'}
			onValueChange={(val) => {
				const v = val as 'en' | 'zh-CN';
				setLocale(v);
				setI18nLocale(v);
			}}
		/>
	);
}

// --- AppearanceSection ---

export function AppearanceSection({
	appZoomLevel, setAppZoomLevel, dirtySetter,
	chatFontSize, setChatFontSize,
	chatFontFamily, setChatFontFamily,
	chatFixedWidth, setChatFixedWidth,
	fontFamilyCollection, t
}: {
	appZoomLevel: number;
	setAppZoomLevel: (val: number) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	chatFontSize: number;
	setChatFontSize: (val: number) => void;
	chatFontFamily: string;
	setChatFontFamily: (val: string) => void;
	chatFixedWidth: boolean;
	setChatFixedWidth: (val: boolean) => void;
	fontFamilyCollection: ListCollection<ComboboxItem>;
	t: (key: string) => string;
}) {
	const { HStack, NativeSelect, Switch, Input } = require('@chakra-ui/react');
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.appearance')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.zoom')}</Text>
				</Box>
				<VStack align="stretch" gap="2">
					<HStack justify="space-between">
						<Text fontSize="13px" color="var(--wc-text-secondary)">{t('sections.appZoom')}</Text>
						<Text fontSize="12px" color="var(--wc-text-muted)" fontFamily='"Geist Mono", monospace'>{Math.round(appZoomLevel * 100)}%</Text>
					</HStack>
					<input type="range" min="0.5" max="3" step="0.05" value={appZoomLevel} onChange={(e: React.ChangeEvent<HTMLInputElement>) => dirtySetter(setAppZoomLevel, Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--wc-accent-blue)' }} />
					<HStack justify="space-between">
						<Text fontSize="10px" color="var(--wc-text-faint)">50%</Text>
						<Text fontSize="10px" color="var(--wc-text-faint)">300%</Text>
					</HStack>
				</VStack>
				<VStack align="stretch" gap="2">
					<Text fontSize="13px" color="var(--wc-text-secondary)">{t('sections.chatFontSize')}</Text>
					<HStack gap="2">
						<Input value={chatFontSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => dirtySetter(setChatFontSize, Math.min(32, Math.max(10, Number(e.target.value))))} type="number" min={10} max={32} size="sm" w="80px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
						<Text fontSize="13px" color="var(--wc-text-muted)">{t('units.px')}</Text>
					</HStack>
				</VStack>
				<VStack align="stretch" gap="2">
					<Text fontSize="13px" color="var(--wc-text-secondary)">{t('sections.chatFontFamily')}</Text>
					<NativeSelect.Root defaultValue={chatFontFamily}>
						<NativeSelect.Field
							bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)"
							color="var(--wc-text-primary)" fontSize="13px" borderRadius="lg"
							onChange={(e: React.ChangeEvent<HTMLSelectElement>) => dirtySetter(setChatFontFamily, e.target.value)}
						>
							<option value="">{t('fonts.default')}</option>
							{fontFamilyCollection.items.map(f => (
								<option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
							))}
						</NativeSelect.Field>
					</NativeSelect.Root>
				</VStack>
				<HStack justify="space-between" alignItems="center">
					<Box flex="1">
						<Text fontSize="13px" color="var(--wc-text-secondary)">{t('sections.fixedChatWidth')}</Text>
						<Text fontSize="11px" color="var(--wc-text-muted)">{t('descriptions.fixedChatWidth')}</Text>
					</Box>
					<Switch.Root label={t('switches.fixedChatWidth')} checked={chatFixedWidth} onCheckedChange={(details: { checked: boolean }) => dirtySetter(setChatFixedWidth, details.checked)}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: chatFixedWidth ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
					</Switch.Root>
				</HStack>
			</VStack>
		</Card>
	);
}

// --- OnboardingSection ---

export function OnboardingSection({ onRerun, t }: {
	onRerun: () => void;
	t: (key: string) => string;
}) {
	const { BookOpen } = require('lucide-react');
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.onboarding')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.onboarding')}</Text>
				</Box>
				<Button variant="ghost" color="var(--wc-text-secondary)" _hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-10)' }} borderRadius="lg" onClick={onRerun}>
					<BookOpen size={15} />{t('actions.rerunOnboarding')}
				</Button>
			</VStack>
		</Card>
	);
}
