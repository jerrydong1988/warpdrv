import { Box, Text, HStack, VStack, Switch } from '@chakra-ui/react';
import { Card } from '../../components/Card';

// --- ChatSection ---

export function ChatSection({ disableTitleGen, setDisableTitleGen, dirtySetter, t }: {
	disableTitleGen: boolean | undefined;
	setDisableTitleGen: (val: boolean) => void;
	dirtySetter: (fn: (val: any) => void, val: any) => void;
	t: (key: string) => string;
}) {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<HStack justify="space-between" alignItems="center" mb="2">
					<Box flex="1">
						<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)">{t('sections.generateTitles')}</Text>
						<Text fontSize="12px" color="var(--wc-text-muted)">{t('descriptions.generateTitles')}</Text>
					</Box>
					<Switch.Root label={t('switches.generateTitles')} checked={!disableTitleGen} onCheckedChange={(details) => dirtySetter(setDisableTitleGen, !details.checked)}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: !disableTitleGen ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
						<Switch.Label ml="2" fontSize="13px" userSelect="none">{t('switches.generateTitles')}</Switch.Label>
					</Switch.Root>
				</HStack>
			</VStack>
		</Card>
	);
}
