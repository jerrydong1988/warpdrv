import { HStack, Box, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { EServerStatus } from '@warpcore/shared';

const STATUS_CONFIG: Record<EServerStatus, { color: string; labelKey: string }> = {
	[EServerStatus.RUNNING]: { color: 'var(--wc-accent-green)', labelKey: 'status.running' },
	[EServerStatus.LOADING]: { color: 'var(--wc-accent-yellow)', labelKey: 'status.loading' },
	[EServerStatus.STOPPED]: { color: 'var(--wc-text-placeholder)', labelKey: 'status.stopped' },
	[EServerStatus.ERROR]: { color: 'var(--wc-accent-red)', labelKey: 'status.error' },
};

export function StatusBadge({ status, port }: { status: EServerStatus; port?: number }) {
	const { t } = useTranslation('servers');
	const config = STATUS_CONFIG[status] ?? { color: 'var(--wc-text-placeholder)', labelKey: 'status.running' };

	let label: string;
	if (port != null) {
		if (status === EServerStatus.RUNNING) {
			label = t('labels.port') + ' ' + port;
		} else if (status === EServerStatus.LOADING) {
			label = t('status.loading') + ' ' + t('labels.port') + ' ' + port;
		} else if (status === EServerStatus.ERROR) {
			label = t('status.error') + ' (' + t('labels.port') + ' ' + port + ')';
		} else {
			label = t('labels.port') + ' ' + port;
		}
	} else {
		label = t(config.labelKey);
	}

	return (
		<HStack
			gap="1.5"
			py="1"
		>
			<Box
				w="6px"
				h="6px"
				borderRadius="full"
				bg={config.color}
				shadow={status === EServerStatus.RUNNING ? `0 0 8px ${config.color}` : 'none'}
				animation={status === EServerStatus.LOADING ? 'pulse 1.5s ease infinite' : undefined}
			/>
			<Text fontSize="10px" fontWeight="600" color={config.color} letterSpacing="0.02em">
				{label}
			</Text>
		</HStack>
	);
}
