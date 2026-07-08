import { useRef, useEffect, useState, useMemo } from 'react';
import { Box, Text, HStack, Flex, Badge, Collapsible } from '@chakra-ui/react';
import { ChevronDown, ChevronRight, CheckCircle, AlertCircle, Circle, XCircle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { ERecipeStepStatus, type IRecipeStepState } from '@warpcore/shared';

interface IStepPanelProps {
	step: IRecipeStepState;
	defaultExpanded?: boolean;
}

const STATUS_ICONS: Record<ERecipeStepStatus, typeof Circle> = {
	[ERecipeStepStatus.PENDING]: Circle,
	[ERecipeStepStatus.RUNNING]: Loader,
	[ERecipeStepStatus.OK]: CheckCircle,
	[ERecipeStepStatus.FAILED]: AlertCircle,
	[ERecipeStepStatus.CANCELLED]: XCircle,
	[ERecipeStepStatus.SKIPPED]: Circle,
};

const STATUS_COLORS: Record<ERecipeStepStatus, string> = {
	[ERecipeStepStatus.PENDING]: 'var(--wc-text-faint)',
	[ERecipeStepStatus.RUNNING]: 'var(--wc-accent-yellow)',
	[ERecipeStepStatus.OK]: 'var(--wc-accent-green)',
	[ERecipeStepStatus.FAILED]: 'var(--wc-accent-red)',
	[ERecipeStepStatus.CANCELLED]: 'var(--wc-text-tertiary)',
	[ERecipeStepStatus.SKIPPED]: 'var(--wc-text-faint)',
};

export function StepPanel({ step, defaultExpanded = false }: IStepPanelProps) {
	const { t } = useTranslation('recipes');
	const stepOutputs = useStore((s) => s.stepOutputs);
	const output = stepOutputs[step.id] ?? '';
	const [expanded, setExpanded] = useState(defaultExpanded || step.status === ERecipeStepStatus.RUNNING || step.status === ERecipeStepStatus.FAILED);
	const [autoScroll, setAutoScroll] = useState(true);
	const outputEndRef = useRef<HTMLDivElement>(null);

	const STATUS_LABELS: Record<ERecipeStepStatus, string> = useMemo(() => ({
		[ERecipeStepStatus.PENDING]: t('stepStatus.pending'),
		[ERecipeStepStatus.RUNNING]: t('stepStatus.running'),
		[ERecipeStepStatus.OK]: t('stepStatus.ok'),
		[ERecipeStepStatus.FAILED]: t('stepStatus.failed'),
		[ERecipeStepStatus.CANCELLED]: t('stepStatus.cancelled'),
		[ERecipeStepStatus.SKIPPED]: t('stepStatus.skipped'),
	}), [t]);

	useEffect(() => {
		if (autoScroll && outputEndRef.current) {
			outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [output, autoScroll]);

	useEffect(() => {
		if (step.status === ERecipeStepStatus.RUNNING || step.status === ERecipeStepStatus.FAILED) {
			setExpanded(true);
		}
	}, [step.status]);

	const statusIcon = STATUS_ICONS[step.status];
	const statusColor = STATUS_COLORS[step.status];
	const statusLabel = STATUS_LABELS[step.status];
	const StatusIcon = statusIcon;
	const isRunning = step.status === ERecipeStepStatus.RUNNING;

	const duration = step.startedAt && step.finishedAt ? `${((step.finishedAt - step.startedAt) / 1000).toFixed(1)}s` : null;

	return (
		<Collapsible.Root open={expanded} onOpenChange={(o) => setExpanded(o.open)}>
			<Box borderRadius="lg" bg="var(--wc-bg-surface)" borderWidth="1px" borderColor="var(--wc-border-subtle)" overflow="hidden">
				<Flex px="3" py="2" align="center" justify="space-between" cursor="pointer" onClick={() => setExpanded(!expanded)} _hover={{ bg: 'var(--wc-bg-surface)' }}>
					<HStack gap="3" flex="1">
						<Box color="var(--wc-text-faint)">
							{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
						</Box>
						<Box color={statusColor}>
							<StatusIcon size={14} className={isRunning ? 'spin' : undefined} style={isRunning ? { animation: 'spin 1.5s linear infinite' } : undefined} />
						</Box>
						<Text fontSize="13px" fontWeight="500" color="var(--wc-text-primary)">{step.name}</Text>
						<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--wc-bg-interactive)" color={config.color} fontSize="10px" fontWeight="600">{statusLabel}</Badge>
						{step.exitCode !== undefined && step.exitCode !== 0 && (
							<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--wc-accent-red-bg-8)" color="var(--wc-accent-red)" fontSize="10px" fontWeight="600">exit {step.exitCode}</Badge>
						)}
					</HStack>
					<HStack gap="2">
						{duration && (
							<Text fontSize="11px" color="var(--wc-text-muted)" fontFamily='"Geist Mono", monospace'>{duration}</Text>
						)}
					</HStack>
				</Flex>
				<Collapsible.Content>
					<Box bg="var(--wc-bg-page)" borderTopWidth="1px" borderColor="var(--wc-border-subtle)" maxH="400px" overflowY="auto" px="3" py="2" fontFamily='"Geist Mono", monospace' fontSize="11px" lineHeight="1.6" onScroll={(e) => {
						const el = e.currentTarget;
						const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
						setAutoScroll(atBottom);
					}}>
						{output.length === 0 ? (
							<Text color="var(--wc-text-placeholder)">{t('stepPanel.noOutput')}</Text>
						) : (
							<Text color="var(--wc-text-secondary)" whiteSpace="pre-wrap" wordBreak="break-all">{output}</Text>
						)}
						<Box ref={outputEndRef} />
					</Box>
				</Collapsible.Content>
			</Box>
		</Collapsible.Root>
	);
}
