import { Box, Text, VStack, HStack, Link, Flex } from '@chakra-ui/react';
import { openExternal } from '../../utils/openExternal';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AboutPage() {
	const { t } = useTranslation('about');

	return (
		<Box>
			<PageHeader
				title={t('title')}
				icon={<Github size={20} />}
			/>
			<Box pt="76px" px="4" pb="4" display="flex" justifyContent="center" alignItems="center" minH="calc(100vh - 100px)" overflow="auto">
				<VStack align="center" gap="6" w="full" maxW="480px">
					{/* Logo */}
					<Box textAlign="center" py="4">
						<img src="/logo.png" alt="WarpDrv" width="160" />
					</Box>

					{/* Attribution */}
					<Card>
						<VStack gap="3" align="center">
							<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">{t('website')}</Text>
							<VStack gap="1.5" alignItems="center">
								<Text fontSize="13px" color="var(--wc-text-secondary)">
									{t('builtWith')}<Text as="span" color="var(--wc-accent-red)">❤</Text> {t('by')}&nbsp;
									<Link href="https://www.github.com/mikjee" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)', textDecoration: 'underline', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); openExternal('https://www.github.com/mikjee'); }}>
										<Text fontSize="13px" fontWeight="500">@mikjee</Text>
									</Link>
								</Text>
								<Text fontSize="13px" color="var(--wc-text-secondary)">
									<Link href="https://warpdrv.ai" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)', textDecoration: 'underline', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); openExternal('https://warpdrv.ai'); }}>
										<Text fontSize="13px" fontWeight="500">{t('visitWebsite')}</Text>
									</Link>
								</Text>
							</VStack>
						</VStack>
					</Card>

					{/* Copyright */}
					<Card>
						<VStack gap="3" align="center">
				<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">{t('copyright')}</Text>
									<Text fontSize="12px" color="var(--wc-text-tertiary)">
								{t('copyrightText')}
							</Text>
						</VStack>
					</Card>

					{/* Legal Links */}
					<Card>
						<VStack gap="3" align="center">
							<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">{t('legal')}</Text>
							<Flex gap="4" flexWrap="wrap" justifyContent="center">
								<Link href="https://raw.githubusercontent.com/mikjee/warpdrv/master/LICENSE" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)', textDecoration: 'underline' }} fontSize="12px" onClick={(e) => { e.preventDefault(); openExternal('https://raw.githubusercontent.com/mikjee/warpdrv/master/LICENSE'); }}>
									{t('licenseAgreement')}
								</Link>
							</Flex>
						</VStack>
					</Card>

					{/* Footer */}
					<Text fontSize="11px" color="var(--wc-text-muted)" textAlign="center" mt="2">
						{t('becomeSponsor')}
					</Text>
				</VStack>
			</Box>
		</Box>
	);
}
