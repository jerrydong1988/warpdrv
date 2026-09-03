import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Flex, VStack, Text } from '@chakra-ui/react';
import { EKvQuantType, type ILaunchParams } from '@warpcore/shared';
import { Card } from '@/components/Card';
import { NumberField, OptionalNumberField, SelectField, SliderNumberField } from './Helpers';

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
				<Box borderTopWidth="1px" borderColor="var(--wc-border-subtle)" pt="5" mt="2">
					<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">
						{t('servers:contextKV.advancedCache')}
					</Text>
					<VStack align="stretch" gap="4">
						<Flex gap="4">
							<OptionalNumberField
								label={t('servers:contextKV.cacheRam')}
								value={params.cacheRam}
								onChange={v => onParamChange('cacheRam', v)}
								min={-1}
								step={1024}
								suffixFn={value => value === undefined
									? t('servers:contextKV.auto')
									: value === -1
										? t('servers:contextKV.unlimited')
										: value === 0 ? t('servers:contextKV.disabled') : 'MiB'}
							/>
							<OptionalNumberField
								label={t('servers:contextKV.ctxCheckpoints')}
								value={params.ctxCheckpoints}
								onChange={v => onParamChange('ctxCheckpoints', v)}
								min={0}
								step={4}
								suffix={params.ctxCheckpoints === undefined
									? t('servers:contextKV.auto')
									: t('servers:contextKV.perSlotCap')}
							/>
						</Flex>
						<OptionalNumberField
							label={t('servers:options.slotPromptSimilarity')}
							value={params.slotPromptSimilarity}
							onChange={v => onParamChange('slotPromptSimilarity', v)}
							min={0}
							max={1}
							step={0.05}
							suffixFn={value => value === undefined
								? t('servers:contextKV.auto')
								: value === 0 ? t('servers:contextKV.disabled') : t('servers:contextKV.range')}
						/>
					</VStack>
				</Box>
			</VStack>
		</Card>
	);
});
