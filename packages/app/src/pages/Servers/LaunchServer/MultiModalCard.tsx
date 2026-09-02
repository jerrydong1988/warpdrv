import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Flex, HStack, VStack, Text, Switch, Input } from '@chakra-ui/react';
import { Eye } from 'lucide-react';
import type { ILaunchParams } from '@warpcore/shared';
import { Card } from '@/components/Card';
import { SelectField } from './Helpers';

export const MultiModalCard = React.memo(({
	useMultiModal,
	onUseMultiModalChange,
	hasMmproj,
	params,
	onParamChange,
}: {
	useMultiModal: boolean;
	onUseMultiModalChange: (v: boolean) => void;
	hasMmproj: boolean;
	params: ILaunchParams;
	onParamChange: (key: keyof ILaunchParams, value: ILaunchParams[keyof ILaunchParams]) => void;
}) => {
	const { t } = useTranslation();
	const mmprojAutoValue = params.mmprojAuto === undefined ? '' : String(params.mmprojAuto);
	const mmprojOffloadValue = params.mmprojOffload === undefined ? '' : String(params.mmprojOffload);
	return (
		<Card bg={useMultiModal ? 'var(--wc-accent-yellow-bg-8)' : undefined} borderColor={useMultiModal ? 'var(--wc-accent-yellow-border)' : undefined}>
			<VStack align="stretch" gap="3">
				<HStack justify="space-between" align="center">
					<HStack gap="3">
						<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
							bg={useMultiModal ? 'var(--wc-accent-yellow-bg-8)' : 'var(--wc-bg-subtle)'}>
							<Eye size={14} color={useMultiModal ? 'var(--wc-accent-yellow)' : 'var(--wc-text-tertiary)'} />
						</Flex>
						<VStack align="start" gap="0.5">
							<Text fontSize="12px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">{t('common:ui.multiModal')}</Text>
							<Text fontSize="11px" color="var(--wc-text-tertiary)">{t('common:ui.visionRequiresMmprojGguf')}</Text>
						</VStack>
					</HStack>
					<Switch.Root label={t('common:ui.useMultiModalMmproj')} checked={useMultiModal} onCheckedChange={(d) => onUseMultiModalChange(d.checked)} disabled={!hasMmproj} color={useMultiModal ? 'var(--wc-accent-yellow)' : 'var(--wc-text-tertiary)'}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: useMultiModal ? 'var(--wc-accent-yellow)' : 'surface.4' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
					</Switch.Root>
				</HStack>
				{/* Projector loading controls (llama.cpp v0.3.0 alignment) */}
				<Box>
					<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{t('servers:options.mmprojUrl')}</Text>
					<Input placeholder={t('servers:options.mmprojUrlPlaceholder')} size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-faint)' }} _focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }} value={params.mmprojUrl ?? ''} onChange={e => onParamChange('mmprojUrl', e.target.value)} />
				</Box>
				<Flex gap="4">
					<SelectField
						label={t('servers:options.mmprojAuto')}
						value={mmprojAutoValue}
						options={['', 'true', 'false']}
						onChange={value => onParamChange('mmprojAuto', value === '' ? undefined : value === 'true')}
						optionLabels={{
							'': t('servers:options.mmprojAutoDefault'),
							'true': t('servers:options.mmprojAutoEnabled'),
							'false': t('servers:options.mmprojAutoDisabled'),
						}}
					/>
					<SelectField
						label={t('servers:options.mmprojOffload')}
						value={mmprojOffloadValue}
						options={['', 'true', 'false']}
						onChange={value => onParamChange('mmprojOffload', value === '' ? undefined : value === 'true')}
						optionLabels={{
							'': t('servers:options.mmprojOffloadDefault'),
							'true': t('servers:options.mmprojOffloadEnabled'),
							'false': t('servers:options.mmprojOffloadDisabled'),
						}}
					/>
				</Flex>
				<Box>
					<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{t('servers:options.mmprojDevice')}</Text>
					<Input placeholder={t('servers:options.mmprojDevicePlaceholder')} size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-faint)' }} _focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }} value={params.mmprojDevice ?? ''} onChange={e => onParamChange('mmprojDevice', e.target.value)} />
				</Box>
			</VStack>
		</Card>
	);
});
