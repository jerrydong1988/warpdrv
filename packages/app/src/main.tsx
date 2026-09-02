import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';
import { system } from './theme/system';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider } from './components/AuthProvider';
import { App } from './App';
import { OnboardingPage } from './pages/Onboarding/OnboardingPage';
import { useStore } from './store';
import { initI18n } from './i18n';

import "./theme/theme-dark.scss";
import "./theme/theme-light.scss";
import "./theme/theme-github-dark.scss";
import "./theme/theme-github-light.scss";
import "./theme/theme-one-dark.scss";
import "./theme/theme-one-light.scss";
import "./theme/theme-dracula-dark.scss";
import "./theme/theme-dracula-light.scss";
import "./theme/theme-catppuccin-mocha.scss";
import "./theme/theme-catppuccin-latte.scss";
import "./theme/theme-nord.scss";
import "./theme/theme-nord-light.scss";
import "./theme/theme-tokyo-night.scss";
import "./theme/theme-tokyo-night-light.scss";
import "./theme/theme-amoled.scss";
import "./theme/theme-vesper.scss";
import "./theme/theme-min.scss";
import "./theme/theme-gruvbox-hard.scss";
import "./theme/theme-rose-pine.scss";
import "./theme/theme-kanagawa.scss";
import "./theme/theme-obsidian.scss";
import "./theme/theme-monokai-pro.scss";
import "./theme/theme-palenight.scss";
import "./theme/theme-solarized-dark.scss";
import "./theme/theme-gruvbox.scss";
import "./theme/theme-kimbie-dark.scss";
import "./theme/theme-everforest-hard.scss";
import "./theme/theme-solarized-light.scss";

// Global error reporting to server (throttled to prevent log flooding)
let lastReportTime = 0;
const REPORT_COOLDOWN_MS = 5000;
const reportError = (payload: Record<string, unknown>) => {
	const now = Date.now();
	if (now - lastReportTime < REPORT_COOLDOWN_MS) return;
	lastReportTime = now;
	try {
		fetch('/api/client-log', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			keepalive: true,
		}).catch(() => {});
	} catch { /* best-effort */ }
};

window.addEventListener('error', (e) => {
	reportError({ level: 'error', message: e.message, stack: e.error?.stack, url: e.filename });
});

window.addEventListener('unhandledrejection', (e) => {
	const reason = e.reason;
	reportError({ level: 'error', message: String(reason?.message ?? reason), stack: reason?.stack });
});

const origConsoleError = console.error;
// JSON.stringify throws on circular references and BigInt — a broken console
// override must never take the original error down with it, so every argument
// is rendered defensively.
const describeLogArg = (a: unknown): string => {
	if (a instanceof Error) return a.stack ?? a.message;
	if (typeof a === 'string') return a;
	try {
		const json = JSON.stringify(a);
		return json === undefined ? String(a) : json;
	} catch {
		return String(a);
	}
};
console.error = (...args) => {
	origConsoleError(...args);
	reportError({
		level: 'error',
		message: args.map(describeLogArg).join(' '),
	});
};

function OnboardingWrapper() {
	const isOnboardingComplete = useStore(s => s.settings.isOnboardingComplete);
	if (isOnboardingComplete === true) return null;
	return <OnboardingPage />;
}

function I18nGate() {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		initI18n()
			.catch(() => undefined)
			.finally(() => setReady(true));
	}, []);

	if (!ready) return null;

	return (
		<AuthProvider>
			<App />
			<OnboardingWrapper />
		</AuthProvider>
	);
}

createRoot(document.getElementById('root-wrapper')!).render(
	<div id="root">
		<StrictMode>
			<ChakraProvider value={system}>
				<BrowserRouter>
					<ToastProvider>
						<I18nGate />
					</ToastProvider>
				</BrowserRouter>
			</ChakraProvider>
		</StrictMode>
	</div>,
);
