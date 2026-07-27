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
            gap="2"
            overflowX="auto"
            minWidth="0"
            bg="rgb(0,0,0)"
            borderRadius="10px 10px 0 0"
            mb="1"
						m="-2"
						p="1.5"
        >
            {Object.keys(componentIds).map(id => {
                const entry = entriesById[id];
                if (!entry) return null;
                return <UiSpaceWrapper key={id} componentId={id} />;
            })}
        </Box>
    );
});
