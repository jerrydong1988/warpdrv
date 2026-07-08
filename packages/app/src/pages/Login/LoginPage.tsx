import { useState } from 'react';
import { Box, Flex, VStack, Text, Input, Button, Heading } from '@chakra-ui/react';
import { Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/ToastProvider';
import { login } from '../../api/services';

export function LoginPage() {
	const { t } = useTranslation('common');
	const navigate = useNavigate();
	const { toast } = useToast();
	const [token, setToken] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!token.trim()) return;

		setLoading(true);
		const result = await login(token.trim());
		setLoading(false);

		if (result.ok) {
			toast('success', t('toast.loginSuccess'));
			navigate('/');
		} else {
			toast('error', result.error ?? t('toast.loginFailed'));
		}
	};

	return (
		<Flex
			minH="100vh"
			alignItems="center"
			justifyContent="center"
			bg="var(--wc-bg-page)"
			p="4"
		>
			<Box
				w="full"
				maxW="sm"
				p="6"
				borderRadius="xl"
				borderWidth="1px"
				borderColor="var(--wc-border-subtle)"
				bg="var(--wc-bg-surface)"
			>
				<VStack gap="4" align="stretch">
					<Flex alignItems="center" gap="3" mb="2">
						<Box
							w="10"
							h="10"
							borderRadius="lg"
							bg="var(--wc-accent-blue-bg-15)"
							borderWidth="1px"
							borderColor="var(--wc-accent-blue-border)"
							display="flex"
							alignItems="center"
							justifyContent="center"
						>
							<Key size={18} color="var(--wc-accent-blue)" />
						</Box>
						<Heading fontSize="18px" color="var(--wc-text-heading)">
							{t('login.title')}
						</Heading>
					</Flex>

					<Text fontSize="13px" color="var(--wc-text-secondary)" fontWeight="500">
						{t('login.description')}
					</Text>

					<form onSubmit={handleSubmit}>
						<VStack gap="3" align="stretch">
							<Input
								value={token}
								onChange={(e) => setToken(e.target.value)}
								placeholder="wc_..."
								size="sm"
								bg="var(--wc-bg-elevated)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)"
								fontSize="12px"
								_placeholder={{ color: 'var(--wc-text-placeholder)' }}
								_focus={{ borderColor: 'var(--wc-accent-blue-focus)' }}
							/>

							<Button
								type="submit"
								size="sm"
								bg="var(--wc-accent-blue-bg-12)"
								color="var(--wc-accent-blue)"
								_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
								fontSize="12px"
								fontWeight="500"
								disabled={loading || !token.trim()}
							>
								{loading ? t('login.loggingIn') : t('login.button')}
							</Button>
						</VStack>
					</form>

					<Text fontSize="11px" color="var(--wc-text-faint)" textAlign="center">
						{t('login.help')}
					</Text>
				</VStack>
			</Box>
		</Flex>
	);
}
