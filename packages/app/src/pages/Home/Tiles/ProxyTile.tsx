import { BsRouter } from 'react-icons/bs';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const ProxyTile = React.memo(() => {
	const { t } = useTranslation('home');
	const navigate = useNavigate();
	const proxyStatus = useStore((s) => s.proxyStatus);
	const settings = useStore((s) => s.settings);

	const state: 'online' | 'loading' | 'error' | 'offline' =
		proxyStatus?.error != null ? 'error' : proxyStatus?.running ? 'online' : 'offline';

	return (
		<TileContainer
			icon={<BsRouter size={18} />}
			label={t('tiles.proxy.title')}
			statusDot={state}
			onClick={() => navigate('/proxy')}
		>
			<TileValueDisplay label={t('tiles.proxy.openaiEndpoint')} value={proxyStatus?.port ?? settings.proxyPort} />
		</TileContainer>
	);
});
