import { Box, Text, Flex } from '@chakra-ui/react';
import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { OnboardingFooter } from '../components/OnboardingFooter';
import type { IStepProps } from '../OnboardingPage';

export function StepDone({ goNext, goPrev, finishOnboarding }: IStepProps) {
	const { t } = useTranslation('onboarding');
	return (
		<Box display="flex" flexDirection="column" h="100%">
			<Box px="4" pt="8">
				<OnboardingHeader title={t('steps.done.headerTitle')} step={3} totalSteps={4} />
			</Box>

			<Box flex="1" display="flex" alignItems="center" justifyContent="center" px="4">
				<Box
					display="flex"
					flexDirection="column"
					alignItems="center"
					textAlign="center"
					py="12"
				>
					<Flex
						w="56px"
						h="56px"
						borderRadius="full"
						alignItems="center"
						justifyContent="center"
						mb="6"
						bg="var(--wc-accent-green-bg-15)"
					>
						<CircleCheck size={32} color="var(--wc-accent-green-icon)" />
					</Flex>
					<Text fontSize="28px" fontWeight="700" color="var(--wc-text-heading)" letterSpacing="-0.03em" mb="3">
						{t('steps.done.title')}
					</Text>
					<Text fontSize="15px" color="var(--wc-text-muted)" maxW="400px" lineHeight="1.6">
						{t('steps.done.body')}
					</Text>
				</Box>
			</Box>

			<OnboardingFooter onBack={goPrev} onNext={finishOnboarding} nextLabel={t('steps.done.startUsing')} />
		</Box>
	);
}
