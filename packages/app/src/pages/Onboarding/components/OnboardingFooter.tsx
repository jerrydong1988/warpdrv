
import { Box, Button, Flex } from '@chakra-ui/react';
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
					_hover={{ color: 'var(--wc-text-primary)' }}
					borderRadius="lg"
					fontSize="13px"
					onClick={onBack}
					disabled={disableBack}
				>
					<ArrowLeft size={16} />
					{backLabel}
				</Button>

				<Button
					bg="var(--wc-accent-blue)"
					color="white"
					_hover={{ bg: 'var(--wc-accent-blue-hover)' }}
					borderRadius="lg"
					fontSize="13px"
					fontWeight="500"
					onClick={onNext}
				>
					{nextLabel}
					<ArrowRight size={16} />
				</Button>
			</Flex>
		</Box>
	);
}
