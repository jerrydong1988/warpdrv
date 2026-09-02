import { useEffect } from 'react';
import { useStore } from '@/store';

export function useEventSource() {
	useEffect(() => {
		// Same-origin endpoint — the Vite dev proxy and the production server
		// both route /api/events to the control plane.
		const eventSource = new EventSource(`/api/events`);

		eventSource.onopen = () => {
			useStore.getState().setSseConnected(true);
			console.log('[SSE] ✅ Connection opened successfully');
		};

		eventSource.onmessage = (event) => {
			try {
				const { channel, data } = JSON.parse(event.data);
				const handlers = useStore.getState().SSEHandlers;
				const handler = handlers[channel];
				if (handler) handler(data);
				else console.error(`[SSE] ❌ No handler registered for channel '${channel}'`);
			} catch (err) {
				console.error('[SSE] Failed to parse event:', err, 'Raw data:', event.data);
			}
		};

		eventSource.onerror = (error) => {
			console.error('[SSE] ❌ Connection error:', error);
			useStore.getState().setSseConnected(false);
		};

		return () => {
			console.log('[SSE] Cleaning up EventSource connection');
			eventSource.close();
		};
	}, []);
}
