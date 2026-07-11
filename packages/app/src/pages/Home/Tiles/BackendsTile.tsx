import { Blocks } from 'lucide-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const BackendsTile = React.memo(() => {
	const { t } = useTranslation('home');
	const navigate = useNavigate();
	const backends = useStore((s) => s.backends);
	const backendsCount = useMemo(() => Object.keys(backends).length, [backends]);

	return (
		<TileContainer
			icon={<Blocks size={18} />}
			label={t('tiles.backends.title')}
			onClick={() => navigate('/backends')}
		>
			<TileValueDisplay label={t('tiles.backends.llamaBuilds')} value={backendsCount} />
		</TileContainer>
	);
});
