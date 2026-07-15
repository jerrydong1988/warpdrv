import { Box, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { ImageCarousel } from '../components/ImageCarousel';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { OnboardingFooter } from '../components/OnboardingFooter';
import type { IStepProps } from '../OnboardingPage';

const getGuideSlides = (t: (key: string) => string) => [
	{
		title: t('steps.guide.slides.hub.title'),
		description: t('steps.guide.slides.hub.description'),
		image: '/screenshots/hub.png',
	},
	{
		title: t('steps.guide.slides.backends.title'),
		description: t('steps.guide.slides.backends.description'),
		image: '/screenshots/backends.png',
	},
	{
		title: t('steps.guide.slides.launch.title'),
		description: t('steps.guide.slides.launch.description'),
		image: '/screenshots/launch.png',
	},
];

export function StepGuide({ goNext, goPrev, finishOnboarding }: IStepProps) {
	const { t } = useTranslation('onboarding');
	const slides = getGuideSlides(t);
	return (
		<Box display="flex" flexDirection="column" h="100%">
			<Box px="4" pt="8">
				<OnboardingHeader title={t('steps.guide.headerTitle')} step={2} totalSteps={4} />
			</Box>

			<Box flex="1" display="flex" alignItems="center" px="4" py="4" overflow="auto">
				<Box w="100%" h="100%">
					<Text fontSize="14px" color="var(--wc-text-muted)" textAlign="center" mb="6">
						{t('common:ui.aQuickWalkthroughOfTheKeyFeatures')}</Text>
					<ImageCarousel slides={slides} />
				</Box>
			</Box>

			<OnboardingFooter onBack={goPrev} onNext={goNext} />
		</Box>
	);
}
