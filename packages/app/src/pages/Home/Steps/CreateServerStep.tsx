import { Text, VStack, Link as ChakraLink } from '@chakra-ui/react';
import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { StepCollapsible } from '../StepCollapsible';

export const CreateServerStep = React.memo(({ done, isOpenDefault, isHighlighted }: { done: boolean; isOpenDefault: boolean; isHighlighted?: boolean }) => {
	const { t } = useTranslation('home');
	return (
	<StepCollapsible
		title={done ? t('steps.createServer.title_done') : t('steps.createServer.title_todo')}
		done={done}
		isOpenDefault={isOpenDefault}
		isHighlighted={isHighlighted}
	>
		<VStack align="stretch" gap="3">
			<Text fontSize="13px" color="var(--wc-text-tertiary)" lineHeight="1.6">
				<Trans t={t} i18nKey="steps.createServer.step1" components={{
					linkServers: <ChakraLink as={NavLink} style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} />,
				}} />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.createServer.step2" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.createServer.step3" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.createServer.step4" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.createServer.step5" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.createServer.step6" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.createServer.step7" />
			</Text>
		</VStack>
	</StepCollapsible>
	);
});
