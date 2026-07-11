import { Server } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const AppServerTile = React.memo(() => {
	const { t } = useTranslation('home');
	const navigate = useNavigate();
	const settings = useStore((s) => s.settings);
	const sseConnected = useStore((s) => s.sseConnected);

	return (
		<TileContainer
			icon={<Server size={18} />}
			label={t('tiles.appServer.title')}
			statusDot={sseConnected ? 'online' : 'error'}
			onClick={() => navigate('/settings')}
		>
			<TileValueDisplay label={t('tiles.appServer.remotePort')} value={settings.apiPort} />
		</TileContainer>
	);
});
