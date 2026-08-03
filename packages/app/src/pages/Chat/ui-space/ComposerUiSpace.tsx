import React from 'react';
import { Box } from '@chakra-ui/react';
import { useStore } from '@/store';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';
import { UiSpaceWrapper } from '@/applets/ui/UiSpaceWrapper';

export const ComposerUiSpace = React.memo(() => {
    const componentIds = useStore(s => s.uiSpaceComponentsByLocation[EUISpaceLoc.COMPOSER]);
    const entriesById = useStore(s => s.uiSpaceComponentsById);

    if (!componentIds || !Object.keys(componentIds).length) return null;

    return (
        <Box
            display="flex"
            flexDir="row"
				justify="space-between"
				alignItems="center"
            w="calc(100% + var(--chakra-spacing-1\.5) * 2.5)"
            overflowX="auto"
            minWidth="0"
            bg="linear-gradient(to bottom, var(--wc-bg-page), transparent)"
            color="var(--wc-fg-absolute)"
				borderRadius="10px 10px 0 0"
				borderBottom="1px solid color-mix(in srgb, var(--wc-border-subtle) 35%, transparent)"
            mb="1"
						m="-2"
						p="1.5"
        >
            {Object.keys(componentIds).map((id, index) => {
                const entry = entriesById[id];
                if (!entry) return null;
                return (
                    <Box key={id} flex="0 0 auto" ml={index > 0 ? "auto" : 0}>
                        <UiSpaceWrapper componentId={id} />
                    </Box>
                );
            })}
        </Box>
    );
});
