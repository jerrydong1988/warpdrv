export async function browseDirectory(
	setNewRoot: (val: string) => void,
	toast: (type: 'success' | 'error' | 'info', message: string) => void,
	t: (key: string) => string,
): Promise<string | null> {
	if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
		try {
			const mod = await import('@tauri-apps/plugin-dialog');
			const path = await mod.open({ directory: true, multiple: false });
			if (path && typeof path === 'string') return path;
		} catch (err) {
			console.error('[Settings] Failed to open directory picker:', err);
		}
	} else if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
		try {
			const handle = await (window as any).showDirectoryPicker();
			if (handle) return handle.name;
		} catch (err: any) {
			if (err.name !== 'AbortError') console.error('[Settings] Failed to open directory picker:', err);
		}
	} else {
		toast('error', t('common:toast.directoryPickerNotSupported'));
	}
	return null;
}
