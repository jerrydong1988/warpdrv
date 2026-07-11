import { Box, Text, HStack, Button, Spinner } from '@chakra-ui/react';
import { Save } from 'lucide-react';

// --- SaveBar ---

export function SaveBar({ isDirty, saveLoading, onSave, t }: {
	isDirty: boolean;
	saveLoading: boolean;
	onSave: () => void;
	t: (key: string) => string;
}) {
	if (!isDirty) return null;
	return (
		<Box position="fixed" bottom="0" left="0" right="0" bg="var(--wc-bg-page)" borderTopWidth="1px" borderColor="var(--wc-border-default)" p="4" zIndex={100}>
			<HStack justify="flex-end" gap="4">
				<Button size="sm" bg="var(--wc-accent-green-bg-15)" color="var(--wc-accent-green-icon)" borderWidth="1px" borderColor="var(--wc-accent-green-border)" _hover={{ bg: 'var(--wc-accent-green-hover)' }} borderRadius="lg" fontSize="13px" fontWeight="500" onClick={onSave} disabled={saveLoading}>
					{saveLoading ? <Spinner size="xs" /> : <Save size={15} />}
					{t('actions.saveChanges')}
				</Button>
			</HStack>
		</Box>
	);
}
