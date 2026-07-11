import { useCallback } from 'react';
import { startProxy, stopProxy } from '../../api/services';
import type { ISettings } from '@warpcore/shared';
import type { IUseMutationResult } from '../../hooks/useQuery';

interface UseSettingsSaveOptions {
	saveMut: IUseMutationResult<Partial<ISettings>, ISettings>;
}

export function useSettingsSave({
	saveMut,
}: UseSettingsSaveOptions) {
	const handleSave = useCallback(async (
		data: Partial<ISettings>,
		proxyEnabled: boolean,
		toast: (type: 'success' | 'error' | 'info', message: string) => void,
	) => {
		await saveMut.mutate(data);

		if (proxyEnabled) {
			try {
				await startProxy();
			} catch (err) {
				console.error('[Settings] Failed to start proxy:', err);
			}
		} else {
			try {
				await stopProxy();
			} catch (err) {
				console.error('[Settings] Failed to stop proxy:', err);
			}
		}
	}, [saveMut]);

	return { handleSave };
}
