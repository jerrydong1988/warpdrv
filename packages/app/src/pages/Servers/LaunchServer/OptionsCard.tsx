import i18nextSingleton from "i18next";
import { Box, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import {
	ELlamaFlashAttentionMode,
	ELlamaLoadMode,
	llamaLoadModeToLegacyParams,
	resolveLlamaLoadMode,
	type ILaunchParams,
} from "@warpcore/shared";
import React from "react";
import { Card } from "@/components/Card";
import { NumberField, SelectField, ToggleChip } from "./Helpers";

export const OptionsCard = React.memo(
	({
		params,
		onParamChange,
		availableLoadModes,
	}: {
		params: ILaunchParams;
		onParamChange: (
			key: keyof ILaunchParams,
			value: ILaunchParams[keyof ILaunchParams],
		) => void;
		availableLoadModes?: ELlamaLoadMode[];
	}) => {
		const loadMode = resolveLlamaLoadMode(params);
		const loadModeOptions = availableLoadModes?.length
			? availableLoadModes.includes(loadMode) ? availableLoadModes : [loadMode, ...availableLoadModes]
			: Object.values(ELlamaLoadMode);
		const flashAttnMode = params.flashAttnMode
			?? (params.flashAttn ? ELlamaFlashAttentionMode.ON : ELlamaFlashAttentionMode.OFF);
		const flashAttnEnabled = flashAttnMode !== ELlamaFlashAttentionMode.OFF;
		const updateLoadMode = (value: string) => {
			const nextMode = value as ELlamaLoadMode;
			const legacyParams = llamaLoadModeToLegacyParams(nextMode);
			onParamChange("loadMode", nextMode);
			onParamChange("mmap", legacyParams.mmap);
			onParamChange("mlock", legacyParams.mlock);
			onParamChange("directIo", legacyParams.directIo);
		};

		return (
			<Card>
				<VStack align="stretch" gap="3">
					<Text
						fontSize="11px"
						color="var(--wc-text-tertiary)"
						textTransform="uppercase"
						letterSpacing="0.05em"
					>

						{i18nextSingleton.t("common:ui.options")}
					</Text>
					<SelectField
						label={i18nextSingleton.t("common:ui.loadMode")}
						value={loadMode}
						options={loadModeOptions}
						onChange={updateLoadMode}
						optionLabels={{
							[ELlamaLoadMode.AUTO]: i18nextSingleton.t("common:ui.loadModeAuto"),
							[ELlamaLoadMode.NONE]: i18nextSingleton.t("common:ui.loadModeNone"),
							[ELlamaLoadMode.MMAP]: i18nextSingleton.t("common:ui.loadModeMmap"),
							[ELlamaLoadMode.MLOCK]: i18nextSingleton.t("common:ui.loadModeMlock"),
							[ELlamaLoadMode.MMAP_MLOCK]: i18nextSingleton.t("common:ui.loadModeMmapMlock"),
							[ELlamaLoadMode.DIO]: i18nextSingleton.t("common:ui.loadModeDio"),
						}}
					/>
					<HStack gap="2" flexWrap="wrap">
						<ToggleChip
							label="Flash Attention"
							active={flashAttnEnabled}
							onClick={() => {
								const nextMode = flashAttnEnabled ? ELlamaFlashAttentionMode.OFF : ELlamaFlashAttentionMode.ON;
								onParamChange("flashAttnMode", nextMode);
								onParamChange("flashAttn", nextMode !== ELlamaFlashAttentionMode.OFF);
							}}
						/>
						<ToggleChip
							label={i18nextSingleton.t("common:ui.noWarmup")}
							active={params.noWarmup}
							onClick={() => onParamChange("noWarmup", !params.noWarmup)}
						/>
						<ToggleChip
							label="Jinja"
							active={params.jinja}
							onClick={() => onParamChange("jinja", !params.jinja)}
						/>
						<ToggleChip
							label={i18nextSingleton.t("common:ui.swaFull")}
							active={params.swaFull}
							onClick={() => onParamChange("swaFull", !params.swaFull)}
						/>
						<ToggleChip
							label="Preserve Thinking"
							active={params.preserveThinking ?? false}
							onClick={() =>
								onParamChange(
									"preserveThinking",
									!(params.preserveThinking ?? false),
								)
							}
						/>
						<ToggleChip
							label={i18nextSingleton.t("common:ui.kvUnified")}
							active={params.kvUnified ?? false}
							onClick={() => onParamChange("kvUnified", !(params.kvUnified ?? false))}
						/>
					</HStack>
					<Flex gap="4">
						<NumberField
							label={i18nextSingleton.t("common:ui.batchSize")}
							value={params.batchSize}
							onChange={(v) => onParamChange("batchSize", v)}
							min={1}
							step={256}
						/>
						<NumberField
							label={i18nextSingleton.t("common:ui.microBatch")}
							value={params.ubatchSize}
							onChange={(v) => onParamChange("ubatchSize", v)}
							min={1}
							step={64}
						/>
					</Flex>
					<Flex gap="4">
						<NumberField
							label={i18nextSingleton.t("common:ui.threads")}
							value={params.threads}
							onChange={(v) => onParamChange("threads", v)}
							min={0}
							suffix="0 = auto"
						/>
						<NumberField
							label={i18nextSingleton.t("common:ui.threadsBatch")}
							value={params.threadsBatch}
							onChange={(v) => onParamChange("threadsBatch", v)}
							min={0}
							suffix="0 = auto"
						/>
					</Flex>
					<Box>
						<Text
							fontSize="11px"
							color="var(--wc-text-tertiary)"
							textTransform="uppercase"
							letterSpacing="0.05em"
							mb="1.5"
						>

							{i18nextSingleton.t("common:ui.chatTemplate")}
						</Text>
						<Input
							placeholder={i18nextSingleton.t("common:ui.autoDetect")}
							size="sm"
							bg="var(--wc-bg-subtle)"
							borderColor="var(--wc-border-default)"
							color="var(--wc-text-primary)"
							fontSize="12px"
							borderRadius="lg"
							_placeholder={{ color: "var(--wc-text-faint)" }}
							_focus={{ borderColor: "var(--wc-accent-blue)", outline: "none" }}
							value={params.chatTemplate}
							onChange={(e) => onParamChange("chatTemplate", e.target.value)}
						/>
					</Box>
					<Box>
						<Text
							fontSize="11px"
							color="var(--wc-text-tertiary)"
							textTransform="uppercase"
							letterSpacing="0.05em"
							mb="1.5"
						>

							{i18nextSingleton.t("common:ui.customFlags")}
						</Text>
						<Input
							placeholder="--some-flag value"
							size="sm"
							bg="var(--wc-bg-subtle)"
							borderColor="var(--wc-border-default)"
							color="var(--wc-text-primary)"
							fontFamily='"Geist Mono", monospace'
							fontSize="12px"
							borderRadius="lg"
							_placeholder={{ color: "var(--wc-text-faint)" }}
							_focus={{ borderColor: "var(--wc-accent-blue)", outline: "none" }}
							value={params.extraArgs}
							onChange={(e) => onParamChange("extraArgs", e.target.value)}
						/>
					</Box>
				</VStack>
			</Card>
		);
	},
);
