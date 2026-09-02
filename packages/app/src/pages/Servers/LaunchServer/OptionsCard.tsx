import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, VStack, HStack, Flex, Text, Input, Switch } from '@chakra-ui/react';
import { ELlamaFlashAttentionMode, ELlamaLoadMode, type ILaunchParams } from '@warpcore/shared';
import { Card } from '@/components/Card';
import { ToggleChip, NumberField, SelectField } from './Helpers';

export const OptionsCard = React.memo(({
	params,
	onParamChange,
}: {
	params: ILaunchParams;
	onParamChange: (key: keyof ILaunchParams, value: ILaunchParams[keyof ILaunchParams]) => void;
}) => {
	const { t } = useTranslation();
	const loadMode = params.loadMode ?? (params.directIo
		? ELlamaLoadMode.DIO
		: params.mmap && params.mlock
			? ELlamaLoadMode.MMAP_MLOCK
			: params.mmap
				? ELlamaLoadMode.MMAP
				: params.mlock ? ELlamaLoadMode.MLOCK : ELlamaLoadMode.NONE);
	const flashAttnMode = params.flashAttnMode ?? (params.flashAttn ? ELlamaFlashAttentionMode.ON : ELlamaFlashAttentionMode.OFF);
	const reasoningPreserveValue = params.reasoningPreserve === undefined ? '' : String(params.reasoningPreserve);
	return (
		<Card>
			<VStack align="stretch" gap="3">
				<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">{t('common:ui.options')}</Text>
				<SelectField
					label={t('common:ui.flashAttention')}
					value={flashAttnMode}
					options={Object.values(ELlamaFlashAttentionMode)}
					onChange={value => {
						const mode = value as ELlamaFlashAttentionMode;
						onParamChange('flashAttnMode', mode);
						onParamChange('flashAttn', mode !== ELlamaFlashAttentionMode.OFF);
					}}
					mono
				/>
				<SelectField
					label={t('common:ui.loadMode')}
					value={loadMode}
					options={Object.values(ELlamaLoadMode)}
					onChange={value => onParamChange('loadMode', value as ELlamaLoadMode)}
					mono
					optionLabels={{
						[ELlamaLoadMode.AUTO]: t('common:ui.loadModeAuto'),
						[ELlamaLoadMode.NONE]: t('common:ui.loadModeNone'),
						[ELlamaLoadMode.MMAP]: t('common:ui.loadModeMmap'),
						[ELlamaLoadMode.MLOCK]: t('common:ui.loadModeMlock'),
						[ELlamaLoadMode.MMAP_MLOCK]: t('common:ui.loadModeMmapMlock'),
						[ELlamaLoadMode.DIO]: t('common:ui.loadModeDio'),
					}}
				/>
				<HStack gap="2" flexWrap="wrap">
					<ToggleChip label={t('common:ui.noWarmup')} active={params.noWarmup} onClick={() => onParamChange('noWarmup', !params.noWarmup)} />
					<ToggleChip label={t('common:ui.jinja')} active={params.jinja} onClick={() => onParamChange('jinja', !params.jinja)} />
					<ToggleChip label={t('common:ui.swaFull')} active={params.swaFull} onClick={() => onParamChange('swaFull', !params.swaFull)} />
					<ToggleChip label={t('servers:options.preserveThinking')} active={params.preserveThinking ?? false} onClick={() => onParamChange('preserveThinking', !(params.preserveThinking ?? false))} />
					<ToggleChip label={t('servers:options.backendSampling')} active={params.backendSampling ?? false} onClick={() => onParamChange('backendSampling', !(params.backendSampling ?? false))} />
				</HStack>
				<Flex gap="4">
					<SelectField
						label={t('servers:options.reasoningPreserve')}
						value={reasoningPreserveValue}
						options={['', 'true', 'false']}
						onChange={value => onParamChange('reasoningPreserve', value === '' ? undefined : value === 'true')}
						optionLabels={{
							'': t('servers:options.reasoningPreserveDefault'),
							'true': t('servers:options.reasoningPreserveKeep'),
							'false': t('servers:options.reasoningPreserveStrip'),
						}}
					/>
					<NumberField
						label={t('servers:options.slotPromptSimilarity')}
						value={params.slotPromptSimilarity ?? 0}
						onChange={v => onParamChange('slotPromptSimilarity', v === 0 ? undefined : v)}
						min={0} max={1} step={0.05}
						suffix={t('servers:options.slotPromptSimilarityHint')}
					/>
				</Flex>
				<Flex gap="4">
					<NumberField label={t('common:ui.batchSize')} value={params.batchSize} onChange={v => onParamChange('batchSize', v)} min={1} step={256} />
					<NumberField label={t('common:ui.microBatch')} value={params.ubatchSize} onChange={v => onParamChange('ubatchSize', v)} min={1} step={64} />
				</Flex>
				<Flex gap="4">
					<NumberField label={t('common:ui.threads')} value={params.threads} onChange={v => onParamChange('threads', v)} min={0} suffix="0 = auto" />
					<NumberField label={t('common:ui.threadsBatch')} value={params.threadsBatch} onChange={v => onParamChange('threadsBatch', v)} min={0} suffix="0 = auto" />
				</Flex>
				<Box>
					<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{t('common:ui.chatTemplate')}</Text>
					<Input placeholder={t('common:ui.autoDetect')} size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-faint)' }} _focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }} value={params.chatTemplate} onChange={e => onParamChange('chatTemplate', e.target.value)} />
				</Box>
				<Box>
					<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{t('common:ui.customFlags')}</Text>
					<Input placeholder="--some-flag value" size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-faint)' }} _focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }} value={params.extraArgs} onChange={e => onParamChange('extraArgs', e.target.value)} />
				</Box>
				{/* LoRA adapters */}
				<Box>
					<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{t('servers:options.loraAdapters')}</Text>
					<Input placeholder={t('servers:options.loraAdaptersPlaceholder')} size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-faint)' }} _focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }} value={params.loraAdapters ?? ''} onChange={e => onParamChange('loraAdapters', e.target.value)} />
				</Box>
				<Box>
					<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{t('servers:options.loraScaled')}</Text>
					<Input placeholder={t('servers:options.loraScaledPlaceholder')} size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-faint)' }} _focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }} value={params.loraScaled ?? ''} onChange={e => onParamChange('loraScaled', e.target.value)} />
				</Box>
				<HStack gap="2" flexWrap="wrap">
					<ToggleChip label={t('servers:options.loraInitWithoutApply')} active={params.loraInitWithoutApply ?? false} onClick={() => onParamChange('loraInitWithoutApply', !(params.loraInitWithoutApply ?? false))} />
				</HStack>
			</VStack>
		</Card>
	);
});
