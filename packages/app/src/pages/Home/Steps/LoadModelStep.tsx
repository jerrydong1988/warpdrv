import { Text, VStack, Link as ChakraLink } from '@chakra-ui/react';
import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { StepCollapsible } from '../StepCollapsible';

export const LoadModelStep = React.memo(({ done, isOpenDefault, isHighlighted }: { done: boolean; isOpenDefault: boolean; isHighlighted?: boolean }) => {
	const { t } = useTranslation('home');
	return (
	<StepCollapsible
		title={done ? t('steps.loadModel.title_done') : t('steps.loadModel.title_todo')}
		done={done}
		isOpenDefault={isOpenDefault}
		isHighlighted={isHighlighted}
	>
		<VStack align="stretch" gap="3">
			<Text fontSize="13px" color="var(--wc-text-tertiary)" lineHeight="1.6">
				<Trans t={t} i18nKey="steps.loadModel.step1" components={{
					linkSettings: <ChakraLink href="/settings" style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" />,
				}} />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.loadModel.step2" components={{
					linkHub: <ChakraLink href="/hub" style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" />,
				}} />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.loadModel.step3" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.loadModel.step4" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.loadModel.step4note" components={{
					strong: <strong />,
				}} />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.loadModel.step5" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.loadModel.step6" />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.loadModel.step7" components={{
					linkModels: <ChakraLink href="/models" style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" />,
				}} />
			</Text>
		</VStack>
	</StepCollapsible>
	);
});
