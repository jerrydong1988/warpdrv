import { useTranslation } from 'react-i18next';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface IOnboardingFooterProps {
	onBack?: () => void;
	onNext?: () => void;
	backLabel?: string;
	nextLabel?: string;
	disableBack?: boolean;
}

export function OnboardingFooter({
	onBack,
	onNext,
	backLabel = 'Back',
	nextLabel = 'Next',
	disableBack = false,
}: IOnboardingFooterProps) {
	return (
		<Box
			position="sticky"
			bottom="0"
			bg="linear-gradient(to top, var(--wc-bg-page) 80%, transparent)"
			pt="8"
			pb="6"
		>
			<Flex justify="space-between" align="center" maxW="560px" mx="auto" px="4">
				<Button
					variant="ghost"
					color="var(--wc-text-secondary)"
					borderRadius="lg"
					fontSize="13px"
					onClick={onBack}
				>
					{backLabel}
				</Button>

				<Button
					bg="var(--wc-accent-blue)"
					color="white"
					borderRadius="lg"
					fontSize="13px"
					fontWeight="500"
					onClick={onNext}
				>
					{nextLabel}
				</Button>
			</Flex>
		</Box>
	);
}
