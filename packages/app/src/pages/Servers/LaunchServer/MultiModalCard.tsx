import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Flex, HStack, VStack, Text, Switch, Input } from '@chakra-ui/react';
import { Eye, FolderOpen } from 'lucide-react';
import type { IGgufFile, ILaunchParams } from '@warpcore/shared';
import { Card } from '@/components/Card';
import { SelectField } from './Helpers';

function fileNameFromPath(filePath: string): string {
	return filePath.split(/[\\/]/).pop() || filePath;
}

export const MultiModalCard = React.memo(({
	useMultiModal,
	onUseMultiModalChange,
	detectedMmproj,
	mmprojFiles,
	params,
	onParamChange,
}: {
	useMultiModal: boolean;
	onUseMultiModalChange: (v: boolean) => void;
	detectedMmproj: IGgufFile | null;
	mmprojFiles: IGgufFile[];
	params: ILaunchParams;
	onParamChange: (key: keyof ILaunchParams, value: ILaunchParams[keyof ILaunchParams]) => void;
}) => {
	const { t } = useTranslation();
	const mmprojAutoValue = params.mmprojAuto === undefined ? '' : String(params.mmprojAuto);
	const mmprojOffloadValue = params.mmprojOffload === undefined ? '' : String(params.mmprojOffload);
	const explicitMmprojPath = params.mmprojPath?.trim() ?? '';
	const mmprojUrl = params.mmprojUrl?.trim() ?? '';
	const mmprojOptions = React.useMemo(() => {
		const paths = [...new Set(mmprojFiles.map(file => file.filePath))];
		if (explicitMmprojPath && !paths.includes(explicitMmprojPath)) paths.push(explicitMmprojPath);
		return ['', ...paths];
	}, [explicitMmprojPath, mmprojFiles]);
	const mmprojOptionLabels = React.useMemo(() => {
		const labels: Record<string, string> = {
			'': detectedMmproj
				? t('servers:options.mmprojAutoDetected', { fileName: detectedMmproj.fileName })
				: t('servers:options.mmprojAutoNotFound'),
		};
		for (const filePath of mmprojOptions.slice(1)) labels[filePath] = fileNameFromPath(filePath);
		return labels;
	}, [detectedMmproj, mmprojOptions, t]);
	const resolvedProjector = explicitMmprojPath || (!mmprojUrl ? detectedMmproj?.filePath ?? '' : '');

	const browseForMmproj = async () => {
		try {
			const { open } = await import('@tauri-apps/plugin-dialog');
			const selected = await open({
				directory: false,
				multiple: false,
				filters: [{ name: 'GGUF', extensions: ['gguf'] }],
			});
			if (typeof selected === 'string') onParamChange('mmprojPath', selected);
		} catch {
			// Browser-only sessions do not expose the native dialog plugin.
		}
	};

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
					<Switch.Root label={t('common:ui.useMultiModalMmproj')} checked={useMultiModal} onCheckedChange={(d) => onUseMultiModalChange(d.checked)} color={useMultiModal ? 'var(--wc-accent-yellow)' : 'var(--wc-text-tertiary)'}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: useMultiModal ? 'var(--wc-accent-yellow)' : 'surface.4' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
					</Switch.Root>
				</HStack>
				{/* Projector loading controls (llama.cpp v0.3.0 alignment) */}
				<HStack align="end" gap="2">
					<SelectField
						label={t('servers:options.mmprojFile')}
						value={explicitMmprojPath}
						options={mmprojOptions}
						onChange={value => onParamChange('mmprojPath', value || undefined)}
						optionLabels={mmprojOptionLabels}
						mono
					/>
					<Button
						size="sm"
						variant="outline"
						px="3"
						flexShrink="0"
						borderColor="var(--wc-border-default)"
						color="var(--wc-text-secondary)"
						_hover={{ borderColor: 'var(--wc-accent-yellow-border)', color: 'var(--wc-accent-yellow)' }}
						onClick={browseForMmproj}
						aria-label={t('common:ui.browseFile')}
						title={t('common:ui.browseFile')}
					>
						<FolderOpen size={14} />
						<Text fontSize="11px">{t('common:ui.browseFile')}</Text>
					</Button>
				</HStack>
				<Text fontSize="10px" color="var(--wc-text-muted)" fontFamily='"Geist Mono", monospace' lineClamp={2}>
					{resolvedProjector
						? t('servers:options.mmprojUsingLocal', { path: resolvedProjector })
						: mmprojUrl
							? t('servers:options.mmprojUsingUrl')
							: t('servers:options.mmprojNoSource')}
				</Text>
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
