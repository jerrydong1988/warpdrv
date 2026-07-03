import { Volume2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const KokoroTile = React.memo(() => {
	const { t } = useTranslation('home');
	const navigate = useNavigate();
	const kokoroStatus = useStore((s) => s.kokoroStatus);
	const isInstalled = kokoroStatus?.installed === true;
	const voiceCount = kokoroStatus?.voicePaths.length ?? 0;

	return (
		<TileContainer
			icon={<Volume2 size={18} />}
			label={t('tiles.kokoro.title')}
			statusDot={isInstalled ? 'online' : 'offline'}
			onClick={() => navigate('/settings')}
		>
			<TileValueDisplay
				label={t('tiles.kokoro.voicesAvailable')}
				value={isInstalled ? voiceCount : '—'}
			/>
		</TileContainer>
	);
});
