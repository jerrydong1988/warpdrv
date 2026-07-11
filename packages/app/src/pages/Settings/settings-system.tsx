import { Box, Text, HStack, VStack, Switch, Input } from '@chakra-ui/react';
import { Card } from '../../components/Card';
import { KeyCapture } from '../../components/KeyCapture';

// --- GlobalPTTSection ---

export function GlobalPTTSection({
	globalPTTKey, setGlobalPTTKey, globalPTTModeHold, setGlobalPTTModeHold, dirtySetter, t
}: {
	globalPTTKey: string;
	setGlobalPTTKey: (val: string) => void;
	globalPTTModeHold: boolean;
	setGlobalPTTModeHold: (val: boolean) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Box>
					<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">{t('sections.globalPTT')}</Text>
					<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.globalPtt')}</Text>
				</Box>
				<KeyCapture value={globalPTTKey} onChange={(key) => dirtySetter(setGlobalPTTKey, key)} onDisable={() => dirtySetter(setGlobalPTTKey, '')} label={t('labels.pttKey')} />
				<HStack gap="3" align="center">
					<Text fontSize="13px" color="var(--wc-text-secondary)">{t('sections.holdMode')}</Text>
					<Switch.Root checked={globalPTTModeHold} onCheckedChange={(details) => dirtySetter(setGlobalPTTModeHold, details.checked)}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: globalPTTModeHold ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
					</Switch.Root>
					<Text fontSize="12px" color="var(--wc-text-muted)">{globalPTTModeHold ? t('switches.pttHold') : t('switches.pttToggle')}</Text>
				</HStack>
			</VStack>
		</Card>
	);
}

// --- AutoLaunchSection ---

export function AutoLaunchSection({
	autoLaunch, setAutoLaunch, startMinimized, setStartMinimized, dirtySetter, t
}: {
	autoLaunch: boolean | null;
	setAutoLaunch: (val: boolean | null) => void;
	startMinimized: boolean | undefined;
	setStartMinimized: (val: boolean) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<HStack justify="space-between" alignItems="center">
					<Box flex="1">
						<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)">{t('sections.launchOnStartup')}</Text>
						<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.launchOnStartup')}</Text>
						{autoLaunch === null && (
							<Text fontSize="11px" color="var(--wc-accent-red-alt)" mt="1">{t('options.desktopApiUnavailable')}</Text>
						)}
					</Box>
					<Switch.Root checked={autoLaunch ?? false} onCheckedChange={(details) => dirtySetter(setAutoLaunch, details.checked)} disabled={autoLaunch === null}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: autoLaunch ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
					</Switch.Root>
				</HStack>
				<Box pt="2" borderTop="1px solid var(--wc-border-default)">
					<HStack justify="space-between" alignItems="center">
						<Box flex="1">
							<Text fontSize="13px" fontWeight="500" color="var(--wc-text-heading)">{t('sections.startMinimized')}</Text>
							<Text fontSize="11px" color="var(--wc-text-muted)">{t('descriptions.startMinimized')}</Text>
						</Box>
						<Switch.Root checked={startMinimized} onCheckedChange={(details) => dirtySetter(setStartMinimized, details.checked)} disabled={!autoLaunch || autoLaunch === null}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: startMinimized ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
								<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
							</Switch.Control>
						</Switch.Root>
					</HStack>
				</Box>
			</VStack>
		</Card>
	);
}
