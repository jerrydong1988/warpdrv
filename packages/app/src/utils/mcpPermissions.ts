export interface IMcpServerPermissionLike {
	serverName: string;
	enabled: boolean;
}

export interface IMcpToolPermissionLike {
	serverName: string;
	toolName: string;
	enabled: boolean;
	approvalMode: string;
}

/**
 * Missing server permissions are intentionally disabled by the bridge.
 * Keep every UI surface aligned with that security boundary.
 */
export function isMcpServerEnabled(
	serverName: string,
	permissions: readonly IMcpServerPermissionLike[],
): boolean {
	return permissions.find(permission => permission.serverName === serverName)?.enabled ?? false;
}

/** Mirrors PermissionManager's global tool filtering for an enabled server. */
export function isMcpToolEnabled(
	serverName: string,
	toolName: string,
	permissions: readonly IMcpToolPermissionLike[],
): boolean {
	const permission = permissions.find(candidate =>
		candidate.serverName === serverName && candidate.toolName === toolName
	);
	return (permission?.enabled ?? true) && permission?.approvalMode !== 'DENIED';
}
