import React from 'react';
import { useTauriWindow } from '@/hooks/useTauriWindow';

const RESIZE_EDGE = 6;
const RESIZE_CORNER = 12;

export const ResizeHandles = React.memo(() => {
	const { isTauri, handleResizeStart } = useTauriWindow();

	if (!isTauri) return null;

	const baseStyle: React.CSSProperties = {
		position: 'absolute',
		zIndex: 10000,
	};

	const edges = [
		{ direction: 'North' as const, top: 0, left: 0, right: 0, height: RESIZE_EDGE, cursor: 'n-resize' },
		{ direction: 'South' as const, bottom: 0, left: 0, right: 0, height: RESIZE_EDGE, cursor: 's-resize' },
		{ direction: 'West' as const, top: 0, left: 0, bottom: 0, width: RESIZE_EDGE, cursor: 'w-resize' },
		{ direction: 'East' as const, top: 0, right: 0, bottom: 0, width: RESIZE_EDGE, cursor: 'e-resize' },
	] as const;

	const corners = [
		{ direction: 'NorthWest' as const, top: 0, left: 0, width: RESIZE_CORNER, height: RESIZE_CORNER, cursor: 'nw-resize' },
		{ direction: 'NorthEast' as const, top: 0, right: 0, width: RESIZE_CORNER, height: RESIZE_CORNER, cursor: 'ne-resize' },
		{ direction: 'SouthWest' as const, bottom: 0, left: 0, width: RESIZE_CORNER, height: RESIZE_CORNER, cursor: 'sw-resize' },
		{ direction: 'SouthEast' as const, bottom: 0, right: 0, width: RESIZE_CORNER, height: RESIZE_CORNER, cursor: 'se-resize' },
	] as const;

	return (
		<>
			{edges.map((e) => (
				<div
					key={e.direction}
					style={{ ...baseStyle, ...((e as unknown) as React.CSSProperties) } as React.CSSProperties}
					onMouseDown={(ev) => {
						ev.preventDefault();
						handleResizeStart(e.direction);
					}}
				/>
			))}
			{corners.map((c) => (
				<div
					key={c.direction}
					style={{ ...baseStyle, ...((c as unknown) as React.CSSProperties) } as React.CSSProperties}
					onMouseDown={(ev) => {
						ev.preventDefault();
						handleResizeStart(c.direction);
					}}
				/>
			))}
		</>
	);
});
