import React, { useMemo } from 'react';
import { useStore } from '@/store';
import { EUISpaceLoc, TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import { WithErrorBoundary } from '@/components/WithErrorBoundary';

const EMPTY: Array<TUiSpaceComponentDef> = [];

export const ToolCallUiSpace = React.memo(({ children, toolCallId, messageId }: { children: React.ReactNode; toolCallId: string; messageId: string }) => {
    const componentIds = useStore(s => s.uiSpaceComponentsByLocation[EUISpaceLoc.TOOL_CALL]);
    const entriesById = useStore(s => s.uiSpaceComponentsById);

    const components = useMemo(() => {
        if (!componentIds || !Object.keys(componentIds).length) return EMPTY;
        return Object
            .keys(componentIds)
            .map(id => entriesById[id])
            .filter(entry => !!entry)
            .map(entry => entry);
    }, [
        componentIds,
        entriesById,
    ]);

    let result = children;
    const fallback = children;

    components.forEach((C) => {
        result = <WithErrorBoundary fallback={fallback}>
            <C.component def={C} toolCallId={toolCallId} messageId={messageId} {...(C.props || {})}>{result}</C.component>
        </WithErrorBoundary>;
    });
    return result;
});
