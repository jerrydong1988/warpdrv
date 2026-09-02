import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Text } from '@chakra-ui/react';
import { ChevronDown, Check } from 'lucide-react';
import { FaShieldAlt } from 'react-icons/fa';
import { computePosition, flip, shift, offset } from '@floating-ui/dom';
import { useStore } from '@/store';
import type { IGuardrailDefinition, IMode, TModeId } from '@warpcore/shared';
import { updateModeGuardrails as updateModeGuardrailsApi } from '@/api/mode-services';
import { useTranslation } from 'react-i18next';

const EMPTY_GUARDRAILS: Record<string, IGuardrailDefinition> = {};

export const ModeGuardrailPicker = memo(({ modeId, value, onClick }: { modeId: string; value: string[]; onClick?: (e: React.MouseEvent) => void }) => {
	const { t } = useTranslation('common');
	const guardrails = useStore(s => s.guardrails) || EMPTY_GUARDRAILS;
	const guardrailNames = useMemo(() => Object.keys(guardrails), [guardrails]);
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLDivElement | null>(null);

	const selectedSet = useMemo(() => new Set(value), [value]);

	const handleToggle = (e: React.MouseEvent, name: string) => {
		e.stopPropagation();
		const next = selectedSet.has(name)
			? value.filter(n => n !== name)
			: [...value, name];
		updateModeGuardrailsApi(modeId, next);
	};

	useEffect(() => {
		if (!isOpen) return;
		const handler = (e: MouseEvent) => {
			if (dropdownRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
			setIsOpen(false);
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen || !triggerRef.current || !dropdownRef.current) return;
		computePosition(triggerRef.current, dropdownRef.current, {
			placement: 'top-start',
			middleware: [offset(6), flip(), shift({ padding: 8 })],
		}).then(({ x, y }) => {
			if (!dropdownRef.current) return;
			dropdownRef.current.style.left = `${x}px`;
			dropdownRef.current.style.top = `${y}px`;
		});
	}, [isOpen]);

	return (
		<Box position="relative">
			<Box
				ref={triggerRef}
				borderWidth="1px"
				borderColor="var(--wc-border-default)"
				borderRadius="md"
				bg="var(--wc-bg-subtle)"
				px="2.5"
				py="1.5"
				cursor="pointer"
				minH="32px"
				onClick={(e) => { onClick?.(e); setIsOpen(!isOpen); }}
			>
				<Text fontSize="xs" color={value.length > 0 ? 'var(--wc-text-primary)' : 'var(--wc-text-faint)'}>
					{value.length > 0 ? t('ui.guardrailsCount', { count: value.length }) : t('ui.noGuardrails')}
				</Text>
			</Box>
			{isOpen && createPortal(
				<div
					ref={dropdownRef}
					style={{
						position: 'absolute',
						zIndex: 10000,
						minWidth: '180px',
						maxWidth: '240px',
						maxHeight: '200px',
						overflowY: 'auto',
						borderRadius: '8px',
						border: '1px solid var(--wc-border-overlay)',
						background: 'var(--wc-bg-elevated)',
						boxShadow: '0px 8px 24px rgba(0,0,0,0.25)',
						padding: '8px',
					}}
				>
					{guardrailNames.length === 0 ? (
						<div style={{ fontSize: '0.75rem', color: 'var(--wc-text-faint)', padding: '4px' }}>{t('ui.noGuardrails')}</div>
					) : (
						guardrailNames.map(name => {
							const isSelected = selectedSet.has(name);
							return (
								<div
									key={name}
									onMouseDown={(e) => e.stopPropagation()}
									onClick={(e) => handleToggle(e, name)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: '6px',
										padding: '6px 8px',
										borderRadius: '6px',
										cursor: 'pointer',
										fontSize: '0.75rem',
										color: 'var(--wc-text-primary)',
										background: isSelected ? 'var(--wc-bg-selected)' : 'transparent',
									}}
									onMouseEnter={(e) => {
										if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--wc-bg-card)';
									}}
									onMouseLeave={(e) => {
										if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
									}}
								>
									{isSelected && <Check size={12} color="var(--wc-accent-purple)" />}
									<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
								</div>
							);
						})
					)}
				</div>,
				document.body,
			)}
		</Box>
	);
});

export const GuardrailBadge = memo(() => {
	const { t } = useTranslation('common');
	const guardrails = useStore(s => s.guardrails) || EMPTY_GUARDRAILS;
	const threadState = useStore(s => s.getCurrentThreadState());
	const setThreadState = useStore(s => s.setThreadState);
	const modes = useStore(s => s.modes);
	const modeId = threadState?.modeId as TModeId | undefined;
	const currentMode = modeId ? modes[modeId] : null;

	const activeNames = useMemo(() => {
		if (currentMode) return currentMode.activeGuardrails || [];
		return (threadState?.activeGuardrails as string[]) || [];
	}, [currentMode, threadState?.activeGuardrails]);

	const guardrailNames = useMemo(() => Object.keys(guardrails), [guardrails]);

	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLDivElement | null>(null);
	const dropdownRef = useRef<HTMLDivElement | null>(null);

	const handleToggle = useCallback((e: React.MouseEvent, name: string) => {
		e.stopPropagation();
		const state = useStore.getState();
		const threadId = state.currentThreadId;
		const ts = state.getCurrentThreadState();
		const m = state.modes;
		const tsModeId = ts?.modeId as TModeId | undefined;
		const active = tsModeId && m[tsModeId] ? m[tsModeId].activeGuardrails || [] : (ts?.activeGuardrails as string[]) || [];
		const isActive = active.includes(name);
		const newNames = isActive ? active.filter(n => n !== name) : [...active, name];
		if (tsModeId && m[tsModeId]) {
			updateModeGuardrailsApi(tsModeId, newNames);
		} else {
			setThreadState(threadId, { activeGuardrails: newNames });
		}
	}, [setThreadState]);

	const handleToggleDropdown = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setIsOpen(!isOpen);
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const handler = (e: MouseEvent) => {
			if (dropdownRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
			setIsOpen(false);
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen || !triggerRef.current || !dropdownRef.current) return;
		computePosition(triggerRef.current, dropdownRef.current, {
			placement: 'top-start',
			middleware: [offset(6), flip(), shift({ padding: 8 })],
		}).then(({ x, y }) => {
			if (!dropdownRef.current) return;
			dropdownRef.current.style.left = `${x}px`;
			dropdownRef.current.style.top = `${y}px`;
		});
	}, [isOpen]);

	const totalActive = activeNames.length;

	return (
		<Box position="relative">
			<Box
				ref={triggerRef}
				display="inline-flex"
				alignItems="center"
				gap="1.5"
				px="2"
				py="2"
				borderRadius="md"
				cursor="pointer"
				userSelect="none"
				bg={totalActive > 0 ? 'var(--wc-bg-selected)' : 'var(--wc-bg-subtle)'}
				borderWidth="1px"
				borderColor={totalActive > 0 ? 'var(--wc-border-subtle)' : 'var(--wc-border-subtle)'}
				opacity={totalActive > 0 ? 1 : 0.6}
				onClick={handleToggleDropdown}
			>
				<FaShieldAlt size={14} color={totalActive > 0 ? 'var(--wc-text-tertiary)' : 'var(--wc-text-muted)'} />
				<Box fontSize="xs" fontWeight="500" color="var(--wc-text-primary)">
					{totalActive > 0 ? `${totalActive} Guardrail${totalActive > 1 ? 's' : ''}` : 'Guardrails'}
				</Box>
				<ChevronDown size={12} color="var(--wc-text-muted)" />
			</Box>
			{isOpen && createPortal(
				<div
					ref={dropdownRef}
					style={{
						position: 'absolute',
						zIndex: 10000,
						minWidth: '180px',
						maxWidth: '240px',
						maxHeight: '200px',
						overflowY: 'auto',
						borderRadius: '8px',
						border: '1px solid var(--wc-border-overlay)',
						background: 'var(--wc-bg-elevated)',
						boxShadow: '0px 8px 24px rgba(0,0,0,0.25)',
						padding: '8px',
					}}
				>
					{guardrailNames.length === 0 ? (
						<div style={{ fontSize: '0.75rem', color: 'var(--wc-text-faint)', padding: '4px' }}>{t('ui.noGuardrails')}</div>
					) : (
						guardrailNames.map(name => {
							const isSelected = activeNames.includes(name);
							return (
								<div
									key={name}
									onMouseDown={(e) => e.stopPropagation()}
									onClick={(e) => handleToggle(e, name)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: '6px',
										padding: '6px 8px',
										borderRadius: '6px',
										cursor: 'pointer',
										fontSize: '0.75rem',
										color: 'var(--wc-text-primary)',
										background: isSelected ? 'var(--wc-bg-selected)' : 'transparent',
									}}
									onMouseEnter={(e) => {
										if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--wc-bg-card)';
									}}
									onMouseLeave={(e) => {
										if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
									}}
								>
									{isSelected && <Check size={12} color="var(--wc-accent-purple)" />}
									<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
								</div>
							);
						})
					)}
				</div>,
				document.body,
			)}
		</Box>
	);
});
