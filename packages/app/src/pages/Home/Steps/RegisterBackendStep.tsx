import { Text, VStack, Link as ChakraLink } from '@chakra-ui/react';
import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { openExternal } from '../../../utils/openExternal';
import { StepCollapsible } from '../StepCollapsible';

export const RegisterBackendStep = React.memo(({ done, isOpenDefault, isHighlighted }: { done: boolean; isOpenDefault: boolean; isHighlighted?: boolean }) => {
	const { t } = useTranslation('home');
	return (
	<StepCollapsible
		title={done ? t('steps.registerBackend.title_done') : t('steps.registerBackend.title_todo')}
		done={done}
		isOpenDefault={isOpenDefault}
		isHighlighted={isHighlighted}
	>
		<VStack align="stretch" gap="3">
			<Text fontSize="13px" color="var(--wc-text-tertiary)" lineHeight="1.6">
				<Trans t={t} i18nKey="steps.registerBackend.step1" components={{
					linkReleases: <ChakraLink href="https://github.com/ggml-org/llama.cpp/releases" target="_blank" rel="noopener noreferrer" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/ggml-org/llama.cpp/releases'); }} />,
					strong: <strong />,
				}} />
				<br />
				<Trans t={t} i18nKey="steps.registerBackend.step1note" components={{
					code: <span style={{ background: 'var(--wc-special-code-bg)', fontFamily: 'mono' }} />,
					linkRecipes: <ChakraLink href="https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md" target="_blank" rel="noopener noreferrer" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md'); }} />,
				}} />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.registerBackend.step2" components={{
					linkBackends: <ChakraLink as={NavLink} {...{ to: '/backends' }} style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} />,
				}} />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.registerBackend.step3" components={{
					code: <span style={{ background: 'var(--wc-special-code-bg)', fontFamily: 'mono' }} />,
				}} />
				<br />
				<br />
				<Trans t={t} i18nKey="steps.registerBackend.step4" />
			</Text>
		</VStack>
	</StepCollapsible>
	);
});
