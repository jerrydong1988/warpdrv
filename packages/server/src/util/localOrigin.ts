/**
 * Single source of truth for "which browser origins may talk to this server".
 *
 * Both the control-plane CORS/CSRF guards and the OpenAI-compatible model proxy
 * need the same answer; keeping two copies of the pattern is how one gets
 * tightened while the other drifts.
 *
 * Allowed:
 *  - no Origin at all  → non-browser client (curl, OpenAI SDKs, native apps)
 *  - localhost / 127.0.0.1 / [::1] on any port (dev servers pick ports freely:
 *    4400 control plane, 5173 Vite, 3000 for the desktop dev shell)
 *  * Tauri/Wry WebView origins (`*.tauri.localhost`, `tauri://…`, `wry://…`)
 *
 * Anything else (e.g. http://localhost.evil.com, http://127.0.0.1@evil.com) is
 * rejected — the pattern is anchored so suffix and userinfo tricks fail.
 */
const LOCAL_OR_SHELL_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?|https?:\/\/([a-z0-9-]+\.)*tauri\.localhost(:\d+)?|tauri:\/\/.*|wry:\/\/.*)$/i;

export function isLocalOrShellOrigin(origin: string | undefined | null): boolean {
	if (!origin) return true; // non-browser client: no Origin header
	return LOCAL_OR_SHELL_ORIGIN.test(origin);
}
