import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

interface IProps {
	fallback?: React.ReactNode;
	children: React.ReactNode;
	name?: string;
}

export const WithErrorBoundary: React.FC<IProps> = ({ fallback, children, name }) => {
	const { t } = useTranslation('common');
	return (
		<ErrorBoundary
			fallbackRender={({ resetErrorBoundary }) => (
				<div style={{ padding: '24px', textAlign: 'center', color: 'var(--wc-text-primary)' }}>
					<p style={{ margin: 0, fontWeight: 600 }}>{name ? t('ui.nameErrored', { name }) : t('ui.somethingWentWrong')}</p>
					<button
						onClick={resetErrorBoundary}
						style={{ marginTop: '12px', padding: '6px 16px', cursor: 'pointer', borderRadius: '6px', border: '1px solid var(--wc-border-default)', background: 'var(--wc-bg-elevated)', color: 'var(--wc-text-primary)' }}
					>
						{t('ui.retry')}
					</button>
				</div>
			)}
			onError={(err) => console.error(`Error Boundary Triggered! ${name || ''}`, err)}
		>
			{children}
		</ErrorBoundary>
	);
};
