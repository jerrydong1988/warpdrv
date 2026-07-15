import React from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, VStack, Text } from '@chakra-ui/react';
import { EKvQuantType, type ILaunchParams } from '@warpcore/shared';
import { Card } from '@/components/Card';
import { NumberField, SelectField, SliderNumberField } from './Helpers';

const KV_QUANT_OPTIONS = Object.values(EKvQuantType);

export const ContextKVCard = React.memo(({
	params,
	onParamChange,
	meta,
}: {
	params: ILaunchParams;
	onParamChange: (key: keyof ILaunchParams, value: ILaunchParams[keyof ILaunchParams]) => void;
	meta: { nLayers: number; contextLength: number } | null;
}) => {
	const { t } = useTranslation();
	const maxContext = meta?.contextLength ?? 131072;
	const hasModelContext = !!meta;

	return (
		<Card>
			<VStack align="stretch" gap="4">
				{hasModelContext ? (
					<SliderNumberField label={t('common:ui.contextSize')} value={params.contextSize} onChange={v => onParamChange('contextSize', v)} min={0} max={maxContext}
						suffix={params.contextSize === 0 ? t('common:ui.0Auto') : t('servers:checkpoints.maxContext', { count: (maxContext / 1024).toFixed(0) })} logarithmic />
				) : (
					<NumberField label={t('common:ui.contextSize')} value={params.contextSize} onChange={v => onParamChange('contextSize', v)} min={0} step={1024} suffix={t('common:ui.0Auto')} />
				)}
				<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">{t('common:ui.kvCacheQuantization')}</Text>
				<Flex gap="4">
					<SelectField label={t('common:ui.kType')} value={params.kvQuantK} options={KV_QUANT_OPTIONS} onChange={v => onParamChange('kvQuantK', v)} mono />
					<SelectField label={t('common:ui.vType')} value={params.kvQuantV} options={KV_QUANT_OPTIONS} onChange={v => onParamChange('kvQuantV', v)} mono />
				</Flex>
				<NumberField label={t('common:ui.parallelSlots')} value={params.parallelSlots} onChange={v => onParamChange('parallelSlots', v)} min={0} suffix="0 = server default" />
			</VStack>
		</Card>
	);
});
