import { FolderOpen } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const ModelsTile = React.memo(() => {
	const { t } = useTranslation('home');
	const navigate = useNavigate();
	const models = useStore((s) => s.models);

	return (
		<TileContainer
			icon={<FolderOpen size={18} />}
			label={t('tiles.models.title')}
			onClick={() => navigate('/models')}
		>
			<TileValueDisplay label={t('tiles.models.llms')} value={Object.values(models).length} />
		</TileContainer>
	);
});
