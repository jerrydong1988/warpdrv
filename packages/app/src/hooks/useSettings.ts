import { useState, useCallback, useEffect } from 'react';
import { useDependantState } from './useDependantState';
import type { ISettings } from '@warpcore/shared';

// --- Model Roots Management ---
export function useModelRoots(
	initialRoots: string[],
	dirtySetter: (fn: (val: any) => void, val: any) => void,
) {
	const [modelRoots, setModelRoots] = useDependantState(initialRoots);
	const [newRoot, setNewRoot] = useState('');
	const [deletingRootIndex, setDeletingRootIndex] = useState<number | null>(null);

	const handleAddRoot = useCallback(() => {
		const trimmed = newRoot.trim();
		if (trimmed && !modelRoots.includes(trimmed)) {
			dirtySetter(setModelRoots, [...modelRoots, trimmed]);
			dirtySetter(setNewRoot, '');
		}
	}, [newRoot, modelRoots, dirtySetter, setModelRoots, setNewRoot]);

	const handleRemoveRoot = useCallback((idx: number) => {
		dirtySetter(setModelRoots, modelRoots.filter((_, i) => i !== idx));
		dirtySetter(setDeletingRootIndex, null);
	}, [modelRoots, dirtySetter, setModelRoots, setDeletingRootIndex]);

	const confirmDeleteRoot = useCallback((idx: number) => {
		dirtySetter(setDeletingRootIndex, idx);
	}, [dirtySetter, setDeletingRootIndex]);

	return {
		modelRoots,
		setModelRoots,
		newRoot,
		setNewRoot,
		deletingRootIndex,
		setDeletingRootIndex,
		handleAddRoot,
		handleRemoveRoot,
		confirmDeleteRoot,
	};
}

// --- FS Allowed Roots Management ---
export function useFsAllowedRoots(
	initialRoots: string[],
	dirtySetter: (fn: (val: any) => void, val: any) => void,
) {
	const [fsAllowedRoots, setFsAllowedRoots] = useDependantState(initialRoots);
	const [newFsRoot, setNewFsRoot] = useState('');

	const addFsRoot = useCallback((path: string) => {
		const trimmed = path.trim();
		if (trimmed && !fsAllowedRoots.includes(trimmed)) {
			dirtySetter(setFsAllowedRoots, [...fsAllowedRoots, trimmed]);
			setNewFsRoot('');
		}
	}, [fsAllowedRoots, dirtySetter, setFsAllowedRoots, setNewFsRoot]);

	return {
		fsAllowedRoots,
		setFsAllowedRoots,
		newFsRoot,
		setNewFsRoot,
		addFsRoot,
	};
}

// --- Mic / Voice Management ---
export function useMicDevices(
	initialDeviceId: string,
	dirtySetter: (fn: (val: any) => void, val: any) => void,
	toast: (type: 'success' | 'error' | 'info', message: string) => void,
	t: (key: string) => string,
) {
	const [micDeviceId, setMicDeviceId] = useDependantState(initialDeviceId);
	const [micDevices, setMicDevices] = useState<Array<{ id: string; label: string }>>([]);
	const [micPermissionGranted, setMicPermissionGranted] = useState(false);

	useEffect(() => {
		const checkMicPermission = async () => {
			try {
				const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
				setMicPermissionGranted(permission.state === 'granted');
				permission.addEventListener('change', () => {
					setMicPermissionGranted(permission.state === 'granted');
					if (permission.state === 'granted') enumerateMicDevices();
				});
			} catch {
				enumerateMicDevices();
			}
		};

		const enumerateMicDevices = async () => {
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const audioInputs = devices
					.filter(d => d.kind === 'audioinput')
					.map(d => ({ id: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)}...)` }));
				setMicDevices(audioInputs);
			} catch {
				setMicDevices([]);
			}
		};

		checkMicPermission();
	}, []);

	const handleGrantMicPermission = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach(t => t.stop());
			setMicPermissionGranted(true);
			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioInputs = devices
				.filter(d => d.kind === 'audioinput')
				.map(d => ({ id: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)}...)` }));
			setMicDevices(audioInputs);
			toast('success', t('toast.microphoneGranted'));
		} catch (err) {
			toast('error', t('toast.microphoneDenied'));
		}
	}, [toast, t]);

	return {
		micDeviceId,
		setMicDeviceId,
		micDevices,
		micPermissionGranted,
		handleGrantMicPermission,
	};
}

// --- Autostart Management ---
export function useAutostart(initialValue: boolean | null | undefined) {
	const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null);
	const [initialAutoLaunch, setInitialAutoLaunch] = useState(initialValue ?? null);

	useEffect(() => {
		const checkOsAutoLaunch = async () => {
			try {
				const mod = await import('@tauri-apps/plugin-autostart');
				const result = await mod.isEnabled();
				setAutoLaunch(result);
			} catch {
				// Not running in Tauri
			}
		};
		checkOsAutoLaunch();
	}, []);

	useEffect(() => {
		setInitialAutoLaunch(initialValue ?? null);
	}, [initialValue]);

	const isAutoLaunchChanged = autoLaunch !== null && autoLaunch !== initialAutoLaunch;

	const applyAutostart = useCallback(async (
		api: { enable: () => Promise<void>; disable: () => Promise<void>; isEnabled: () => Promise<boolean> } | null,
		value: boolean | null,
		toast: (type: 'success' | 'error' | 'info', message: string) => void,
		t: (key: string) => string,
	) => {
		if (!api || value === null) return;
		try {
			if (value) await api.enable();
			else await api.disable();
			const isEnabled = await api.isEnabled();
			setAutoLaunch(isEnabled);
		} catch (err) {
			console.error('[Settings] Failed to apply autostart setting:', err);
			toast('error', t('common:toast.autostartUpdateFailed'));
		}
	}, []);

	return { autoLaunch, setAutoLaunch, applyAutostart, isAutoLaunchChanged, initialAutoLaunch };
}
