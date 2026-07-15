import React from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, HStack, VStack, Text, Switch } from '@chakra-ui/react';
import { Brain } from 'lucide-react';
import { Card } from '@/components/Card';

export const EmbeddingCard = React.memo(({
	useEmbedding,
	onUseEmbeddingChange,
}: {
	useEmbedding: boolean;
	onUseEmbeddingChange: (v: boolean) => void;
}) => {
	const { t } = useTranslation();
	return (
		<Card bg={useEmbedding ? 'var(--wc-accent-purple-bg-8)' : undefined} borderColor={useEmbedding ? 'var(--wc-accent-purple-border)' : undefined}>
			<HStack justify="space-between" align="center">
				<HStack gap="3">
					<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
						bg={useEmbedding ? 'var(--wc-accent-purple-bg-8)' : 'var(--wc-bg-subtle)'}>
						<Brain size={14} color={useEmbedding ? 'var(--wc-accent-purple)' : 'var(--wc-text-tertiary)'} />
					</Flex>
					<VStack align="start" gap="0.5">
						<Text fontSize="12px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">{t('common:ui.embedding')}</Text>
						<Text fontSize="11px" color="var(--wc-text-tertiary)">{t('common:ui.enableV1EmbeddingsEndpointForRag')}</Text>
					</VStack>
				</HStack>
				<Switch.Root label={t('common:ui.useEmbeddingMode')} checked={useEmbedding} onCheckedChange={(d) => onUseEmbeddingChange(d.checked)} color={useEmbedding ? 'var(--wc-accent-purple)' : 'var(--wc-text-tertiary)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: useEmbedding ? 'var(--wc-accent-purple)' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
					</Switch.Control>
				</Switch.Root>
			</HStack>
		</Card>
	);
});
