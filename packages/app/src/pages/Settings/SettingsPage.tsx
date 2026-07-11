import { Box, Text, VStack, Combobox, createListCollection } from '@chakra-ui/react';
import { Settings } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { setLocale as setI18nLocale } from '../../i18n';
import { useDependantState } from '../../hooks/useDependantState';
import { PageHeader } from '../../components/PageHeader';
import { useMutation } from '../../hooks/useQuery';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import { updateSettings } from '../../api/services';
import type { ISettings } from '@warpcore/shared';
import { ETheme } from '@warpcore/shared';
import { useToast } from '../../components/ToastProvider';
import { useStore } from '../../store';
import { useModelRoots, useFsAllowedRoots, useMicDevices, useAutostart } from '../../hooks/useSettings';
import { ThemeSection, LanguageSection, AppearanceSection, OnboardingSection, type ComboboxItem } from './settings-general';
import { ModelDirsSection, PortRangeSection, CheckpointsSection, ConfirmDeleteDialog } from './settings-io';
import { ChatSection } from './settings-chat';
import { VoiceInputSection, VoiceOutputSection, DictationSection } from './settings-voice';
import { GlobalPTTSection, AutoLaunchSection } from './settings-system';
import { APISection, BuiltinMcpSection, RouterSection } from './settings-network';
import { SaveBar } from './settings-dialogs';
import { useSettingsSave } from './useSettingsSave';
import { browseDirectory } from './browse-directory';

export function SettingsPage() {
	const { t } = useTranslation('settings');
	const { toast } = useToast();
	const settings = useStore(s => s.settings);
	const locale = useStore(s => (s.settings as any)?.locale);
	const setLocale = useStore(s => s.setLocale);

	const [isDirty, setIsDirty] = useState(false);
	const dirtySetter = useCallback((fn: (val: any) => void, val: any) => {
		fn(val);
		setIsDirty(true);
	}, []);

	const saveMut = useMutation<Partial<ISettings>, ISettings>(
		useCallback((data: Partial<ISettings>) => updateSettings(data), [])
	);

	const { handleSave: handleSettingsSave } = useSettingsSave({
		saveMut,
	});

	const { modelRoots, setModelRoots, newRoot, setNewRoot, deletingRootIndex, setDeletingRootIndex, handleAddRoot, handleRemoveRoot, confirmDeleteRoot } =
		useModelRoots(settings.modelRoots, dirtySetter);

	const { fsAllowedRoots, setFsAllowedRoots, newFsRoot, setNewFsRoot, addFsRoot } =
		useFsAllowedRoots(settings.fsAllowedRoots ?? [], dirtySetter);

	const { micDeviceId, setMicDeviceId, micDevices, micPermissionGranted, handleGrantMicPermission } =
		useMicDevices(settings.micDeviceId ?? '', dirtySetter, toast, t);

	const { autoLaunch, setAutoLaunch, applyAutostart, isAutoLaunchChanged, initialAutoLaunch } =
		useAutostart((settings as any)?.autoLaunch);

	const [portStart, setPortStart] = useDependantState(settings.portRangeStart);
	const [portEnd, setPortEnd] = useDependantState(settings.portRangeEnd);
	const [apiHost, setApiHost] = useDependantState(settings.apiHost);
	const [apiPort, setApiPort] = useDependantState(settings.apiPort);
	const [proxyEnabled, setProxyEnabled] = useDependantState(settings.proxyEnabled);
	const [proxyPort, setProxyPort] = useDependantState(settings.proxyPort);
	const [startMinimized, setStartMinimized] = useDependantState(settings.startMinimized);
	const [checkpointsPath, setCheckpointsPath] = useDependantState(settings.checkpointsPath);
	const [maxCheckpointDiskGB, setMaxCheckpointDiskGB] = useDependantState(settings.maxCheckpointDiskGB);
	const [disableTitleGen, setDisableTitleGen] = useDependantState(settings.disableTitleGen);
	const [kokoroVoice, setKokoroVoice] = useDependantState(settings.kokoroVoice ?? 'af_heart');
	const [kokoroSpeed, setKokoroSpeed] = useDependantState(settings.kokoroSpeed ?? 1);
	const [builtinMcpPort, setBuiltinMcpPort] = useDependantState(settings.builtinMcpPort ?? 11437);
	const [builtinMcpExposeExternal, setBuiltinMcpExposeExternal] = useDependantState(settings.builtinMcpExposeExternal ?? false);
	const [localTheme, setLocalTheme] = useDependantState(settings.theme ?? ETheme.DARK);
	const [appZoomLevel, setAppZoomLevel] = useDependantState(settings.appZoomLevel ?? 1.0);
	const [chatFontSize, setChatFontSize] = useDependantState(settings.chatFontSize ?? 14);
	const [chatFontFamily, setChatFontFamily] = useDependantState(settings.chatFontFamily ?? '');
	const [chatFixedWidth, setChatFixedWidth] = useDependantState(settings.chatFixedWidth ?? false);
	const [dictationPTTKey, setDictationPTTKey] = useDependantState(settings.dictationPTTKey ?? 'Insert');
	const [dictationPTTModeHold, setDictationPTTModeHold] = useDependantState(settings.dictationPTTModeHold ?? false);
	const [globalPTTKey, setGlobalPTTKey] = useDependantState(settings.globalPTTKey ?? '');
	const [globalPTTModeHold, setGlobalPTTModeHold] = useDependantState(settings.globalPTTModeHold ?? false);

	const fontFamilyCollection = createListCollection<ComboboxItem>({
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

	const voiceCollection = createListCollection<ComboboxItem>({
		items: [
			{ label: 'Heart (Female, US)', value: 'af_heart' },
			{ label: 'Bella (Female, US)', value: 'af_bella' },
			{ label: 'Nicole (Female, US)', value: 'af_nicole' },
			{ label: 'Adam (Male, US)', value: 'am_adam' },
			{ label: 'Michael (Male, US)', value: 'am_michael' },
			{ label: 'Emma (Female, UK)', value: 'bf_emma' },
			{ label: 'George (Male, UK)', value: 'bm_george' },
		],
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});

	const handleBrowseFsRoot = useCallback(async () => {
		const path = await browseDirectory(setNewFsRoot, toast, t);
		if (path) setNewFsRoot(path);
	}, [setNewFsRoot, toast, t]);

	const handleBrowseDirectoryForModel = useCallback(async () => {
		const path = await browseDirectory(setNewRoot, toast, t);
		if (path) {
			if (!modelRoots.includes(path)) {
				dirtySetter(setNewRoot, path);
			}
		}
	}, [setNewRoot, modelRoots, dirtySetter, toast, t]);

	const handleSave = useCallback(async () => {
		const pendingRoot = newRoot.trim();
		if (pendingRoot && !modelRoots.includes(pendingRoot)) {
			dirtySetter(setModelRoots, [...modelRoots, pendingRoot]);
			dirtySetter(setNewRoot, '');
		}
		const pendingFsRoot = newFsRoot.trim();
		if (pendingFsRoot && !fsAllowedRoots.includes(pendingFsRoot)) {
			dirtySetter(setFsAllowedRoots, [...fsAllowedRoots, pendingFsRoot]);
			setNewFsRoot('');
		}

		const settingsData: Partial<ISettings> = {
			modelRoots,
			portRangeStart: portStart,
			portRangeEnd: portEnd,
			apiHost,
			apiPort,
			proxyEnabled,
			proxyPort,
			startMinimized,
			checkpointsPath,
			maxCheckpointDiskGB,
			disableTitleGen,
			kokoroVoice,
			kokoroSpeed,
			builtinMcpPort,
			builtinMcpExposeExternal,
			theme: localTheme,
			appZoomLevel,
			chatFontSize,
			chatFontFamily,
			chatFixedWidth,
			dictationPTTKey,
			dictationPTTModeHold,
			globalPTTKey,
			globalPTTModeHold,
			micDeviceId,
			fsAllowedRoots,
		};

		await handleSettingsSave(
			settingsData,
			proxyEnabled,
			toast,
		);

		if (isAutoLaunchChanged && initialAutoLaunch !== undefined && autoLaunch !== null) {
			try {
				const mod = await import('@tauri-apps/plugin-autostart');
				await applyAutostart(mod, autoLaunch, toast, t);
			} catch {
				// Not running in Tauri
			}
		}

		setIsDirty(false);
		toast('success', t('common:toast.settingsSaved'));
	}, [
		modelRoots, portStart, portEnd, apiHost, apiPort, proxyEnabled,
		startMinimized, checkpointsPath, maxCheckpointDiskGB, disableTitleGen,
		kokoroVoice, kokoroSpeed, builtinMcpPort, builtinMcpExposeExternal,
		localTheme, appZoomLevel, chatFontSize, chatFontFamily, chatFixedWidth,
		dictationPTTKey, dictationPTTModeHold, globalPTTKey, globalPTTModeHold,
		micDeviceId, fsAllowedRoots, newRoot, newFsRoot,
		setModelRoots, setFsAllowedRoots,
		handleSettingsSave,
		dirtySetter, toast, t, applyAutostart,
		isAutoLaunchChanged, initialAutoLaunch,
	]);

	const handleRerunOnboarding = useCallback(() => {
		updateSettings({ isOnboardingComplete: false });
		toast('info', t('toast.onboardingRestarted'));
	}, [toast, t]);

	return (
		<VStack align="stretch" gap="6" px={{ base: 4, md: 8 }} pt={6} css={{ paddingBottom: isDirty ? '80px' : '40px' }}>
			<PageHeader icon={<Settings />} title={t('title')} subtitle={t('description')} />

			<VStack align="stretch" gap="4">
				<ThemeSection localTheme={localTheme} setLocalTheme={setLocalTheme} dirtySetter={dirtySetter} t={t} />
				<LanguageSection locale={locale} setLocale={setLocale} dirtySetter={dirtySetter} setI18nLocale={setI18nLocale} t={t} />
				<AppearanceSection
					appZoomLevel={appZoomLevel} setAppZoomLevel={setAppZoomLevel} dirtySetter={dirtySetter}
					chatFontSize={chatFontSize} setChatFontSize={setChatFontSize}
					chatFontFamily={chatFontFamily} setChatFontFamily={setChatFontFamily}
					chatFixedWidth={chatFixedWidth} setChatFixedWidth={setChatFixedWidth}
					fontFamilyCollection={fontFamilyCollection} t={t}
				/>
				<ModelDirsSection
					modelRoots={modelRoots} setModelRoots={setModelRoots}
					newRoot={newRoot} setNewRoot={setNewRoot}
					deletingRootIndex={deletingRootIndex} setDeletingRootIndex={setDeletingRootIndex}
					handleAddRoot={handleAddRoot} handleRemoveRoot={handleRemoveRoot}
					confirmDeleteRoot={confirmDeleteRoot}
					handleBrowseDirectory={handleBrowseDirectoryForModel}
					t={t} onConfirmDelete={confirmDeleteRoot}
					dirtySetter={dirtySetter}
				/>
				<PortRangeSection portStart={portStart} setPortStart={setPortStart} portEnd={portEnd} setPortEnd={setPortEnd} dirtySetter={dirtySetter} t={t} />
				<CheckpointsSection checkpointsPath={checkpointsPath} setCheckpointsPath={setCheckpointsPath} maxCheckpointDiskGB={maxCheckpointDiskGB} setMaxCheckpointDiskGB={setMaxCheckpointDiskGB} dirtySetter={dirtySetter} t={t} />
				<ChatSection disableTitleGen={disableTitleGen} setDisableTitleGen={setDisableTitleGen} dirtySetter={dirtySetter} t={t} />
				<VoiceInputSection micDeviceId={micDeviceId} setMicDeviceId={setMicDeviceId} micDevices={micDevices} micPermissionGranted={micPermissionGranted} handleGrantMicPermission={handleGrantMicPermission} dirtySetter={dirtySetter} t={t} />
				<VoiceOutputSection voiceCollection={voiceCollection} kokoroVoice={kokoroVoice} setKokoroVoice={setKokoroVoice} kokoroSpeed={kokoroSpeed} setKokoroSpeed={setKokoroSpeed} dirtySetter={dirtySetter} t={t} />
				<DictationSection dictationPTTKey={dictationPTTKey} setDictationPTTKey={setDictationPTTKey} dictationPTTModeHold={dictationPTTModeHold} setDictationPTTModeHold={setDictationPTTModeHold} dirtySetter={dirtySetter} t={t} />
				<GlobalPTTSection globalPTTKey={globalPTTKey} setGlobalPTTKey={setGlobalPTTKey} globalPTTModeHold={globalPTTModeHold} setGlobalPTTModeHold={setGlobalPTTModeHold} dirtySetter={dirtySetter} t={t} />
				<APISection apiHost={apiHost} setApiHost={setApiHost} apiPort={apiPort} setApiPort={setApiPort} dirtySetter={dirtySetter} t={t} />
				<BuiltinMcpSection
					builtinMcpPort={builtinMcpPort} setBuiltinMcpPort={setBuiltinMcpPort}
					builtinMcpExposeExternal={builtinMcpExposeExternal} setBuiltinMcpExposeExternal={setBuiltinMcpExposeExternal}
					fsAllowedRoots={fsAllowedRoots} setFsAllowedRoots={setFsAllowedRoots}
					newFsRoot={newFsRoot} setNewFsRoot={setNewFsRoot}
					handleBrowseFsRoot={handleBrowseFsRoot} dirtySetter={dirtySetter} t={t}
				/>
				<RouterSection proxyEnabled={proxyEnabled} setProxyEnabled={setProxyEnabled} proxyPort={proxyPort} setProxyPort={setProxyPort} dirtySetter={dirtySetter} t={t} />
				<AutoLaunchSection autoLaunch={autoLaunch} setAutoLaunch={setAutoLaunch} startMinimized={startMinimized} setStartMinimized={setStartMinimized} dirtySetter={dirtySetter} t={t} />
				<OnboardingSection onRerun={handleRerunOnboarding} t={t} />
			</VStack>

			<SaveBar isDirty={isDirty} saveLoading={saveMut.loading} onSave={handleSave} t={t} />

			<ConfirmDeleteDialog
				deletingRootIndex={deletingRootIndex}
				path={modelRoots[deletingRootIndex ?? -1] ?? ''}
				onCancel={() => setDeletingRootIndex(null)}
				onConfirm={() => deletingRootIndex !== null && handleRemoveRoot(deletingRootIndex)}
				t={t}
			/>
		</VStack>
	);
}
