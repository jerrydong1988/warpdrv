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

	const edges: Array<{
		direction: 'North' | 'South' | 'West' | 'East';
		top?: number;
		bottom?: number;
		left?: number;
		right?: number;
		width?: number;
		height?: number;
		cursor: string;
	}> = [
		{ direction: 'North', top: 0, left: 0, right: 0, height: RESIZE_EDGE, cursor: 'n-resize' },
		{ direction: 'South', bottom: 0, left: 0, right: 0, height: RESIZE_EDGE, cursor: 's-resize' },
		{ direction: 'West', top: 0, left: 0, bottom: 0, width: RESIZE_EDGE, cursor: 'w-resize' },
		{ direction: 'East', top: 0, right: 0, bottom: 0, width: RESIZE_EDGE, cursor: 'e-resize' },
	];

	const corners: Array<{
		direction: 'NorthWest' | 'NorthEast' | 'SouthWest' | 'SouthEast';
		top?: number;
		bottom?: number;
		left?: number;
		right?: number;
		width?: number;
		height?: number;
		cursor: string;
	}> = [
		{ direction: 'NorthWest', top: 0, left: 0, width: RESIZE_CORNER, height: RESIZE_CORNER, cursor: 'nw-resize' },
		{ direction: 'NorthEast', top: 0, right: 0, width: RESIZE_CORNER, height: RESIZE_CORNER, cursor: 'ne-resize' },
		{ direction: 'SouthWest', bottom: 0, left: 0, width: RESIZE_CORNER, height: RESIZE_CORNER, cursor: 'sw-resize' },
		{ direction: 'SouthEast', bottom: 0, right: 0, width: RESIZE_CORNER, height: RESIZE_CORNER, cursor: 'se-resize' },
	];

	return (
		<>
			{edges.map((e) => {
				const { direction, ...rest } = e;
				return (
					<div
						key={direction}
						style={{ ...baseStyle, ...rest }}
						onMouseDown={(ev) => {
							ev.preventDefault();
							handleResizeStart(direction);
						}}
					/>
				);
			})}
			{corners.map((c) => {
				const { direction, ...rest } = c;
				return (
					<div
						key={direction}
						style={{ ...baseStyle, ...rest }}
						onMouseDown={(ev) => {
							ev.preventDefault();
							handleResizeStart(direction);
						}}
					/>
				);
			})}
		</>
	);
});
