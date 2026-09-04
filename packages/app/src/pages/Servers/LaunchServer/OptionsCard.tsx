import { Box, Button, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import {
	ELlamaFlashAttentionMode,
	ELlamaLoadMode,
	llamaLoadModeToLegacyParams,
	resolveLlamaLoadMode,
	type ILaunchParams,
} from "@warpcore/shared";
import { FileInput } from "lucide-react";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/Card";
import { useToast } from "@/components/ToastProvider";
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
		const { t } = useTranslation();
		const { toast } = useToast();
		const loadMode = resolveLlamaLoadMode(params);
		const loadModeOptions = availableLoadModes?.length
			? availableLoadModes.includes(loadMode)
				? availableLoadModes
				: [loadMode, ...availableLoadModes]
			: Object.values(ELlamaLoadMode);
		const flashAttnMode =
			params.flashAttnMode ??
			(params.flashAttn ? ELlamaFlashAttentionMode.ON : ELlamaFlashAttentionMode.OFF);
		const flashAttnEnabled = flashAttnMode !== ELlamaFlashAttentionMode.OFF;

		const updateLoadMode = (value: string) => {
			const nextMode = value as ELlamaLoadMode;
			const legacyParams = llamaLoadModeToLegacyParams(nextMode);
			onParamChange("loadMode", nextMode);
			onParamChange("mmap", legacyParams.mmap);
			onParamChange("mlock", legacyParams.mlock);
			onParamChange("directIo", legacyParams.directIo);
		};

		const handleBrowseChatTemplateFile = useCallback(async () => {
			if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
				try {
					const mod = await import("@tauri-apps/plugin-dialog");
					const result = await mod.open({
						directory: false,
						multiple: false,
						filters: [
							{ name: t("common:ui.jinjaFiles"), extensions: ["jinja"] },
							{ name: t("common:ui.allFiles"), extensions: ["*"] },
						],
					});
					if (result) onParamChange("chatTemplateFile", result);
				} catch (error) {
					console.error("[OptionsCard] Failed to open chat template file picker:", error);
				}
			} else {
				toast("error", t("common:ui.filePickerUnsupported"));
			}
		}, [onParamChange, t, toast]);

		return (
			<Card>
				<VStack align="stretch" gap="3">
					<Text
						fontSize="11px"
						color="var(--wc-text-tertiary)"
						textTransform="uppercase"
						letterSpacing="0.05em"
					>
						{t("common:ui.options")}
					</Text>
					<SelectField
						label={t("common:ui.loadMode")}
						value={loadMode}
						options={loadModeOptions}
						onChange={updateLoadMode}
						optionLabels={{
							[ELlamaLoadMode.AUTO]: t("common:ui.loadModeAuto"),
							[ELlamaLoadMode.NONE]: t("common:ui.loadModeNone"),
							[ELlamaLoadMode.MMAP]: t("common:ui.loadModeMmap"),
							[ELlamaLoadMode.MLOCK]: t("common:ui.loadModeMlock"),
							[ELlamaLoadMode.MMAP_MLOCK]: t("common:ui.loadModeMmapMlock"),
							[ELlamaLoadMode.DIO]: t("common:ui.loadModeDio"),
						}}
					/>
					<HStack gap="2" flexWrap="wrap">
						<ToggleChip
							label="Flash Attention"
							active={flashAttnEnabled}
							onClick={() => {
								const nextMode = flashAttnEnabled
									? ELlamaFlashAttentionMode.OFF
									: ELlamaFlashAttentionMode.ON;
								onParamChange("flashAttnMode", nextMode);
								onParamChange(
									"flashAttn",
									nextMode !== ELlamaFlashAttentionMode.OFF,
								);
							}}
						/>
						<ToggleChip
							label={t("common:ui.noWarmup")}
							active={params.noWarmup}
							onClick={() => onParamChange("noWarmup", !params.noWarmup)}
						/>
						<ToggleChip
							label="Jinja"
							active={params.jinja}
							onClick={() => onParamChange("jinja", !params.jinja)}
						/>
						<ToggleChip
							label={t("common:ui.swaFull")}
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
							label={t("common:ui.kvUnified")}
							active={params.kvUnified ?? false}
							onClick={() => onParamChange("kvUnified", !(params.kvUnified ?? false))}
						/>
					</HStack>
					<Flex gap="4">
						<NumberField
							label={t("common:ui.batchSize")}
							value={params.batchSize}
							onChange={(value) => onParamChange("batchSize", value)}
							min={1}
							step={256}
						/>
						<NumberField
							label={t("common:ui.microBatch")}
							value={params.ubatchSize}
							onChange={(value) => onParamChange("ubatchSize", value)}
							min={1}
							step={64}
						/>
					</Flex>
					<Flex gap="4">
						<NumberField
							label={t("common:ui.threads")}
							value={params.threads}
							onChange={(value) => onParamChange("threads", value)}
							min={0}
							suffix="0 = auto"
						/>
						<NumberField
							label={t("common:ui.threadsBatch")}
							value={params.threadsBatch}
							onChange={(value) => onParamChange("threadsBatch", value)}
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
							{t("common:ui.chatTemplate")}
						</Text>
						<HStack gap="2" mb="2">
							{(["inline", "file"] as const).map((mode) => (
								<Button
									key={mode}
									size="sm"
									variant="outline"
									flex="1"
									justifyContent="center"
									borderColor={
										params.chatTemplateMode === mode
											? "var(--wc-accent-blue-border)"
											: "var(--wc-border-subtle)"
									}
									borderWidth={params.chatTemplateMode === mode ? "2px" : "1px"}
									color={
										params.chatTemplateMode === mode
											? "var(--wc-accent-blue)"
											: "var(--wc-text-secondary)"
									}
									bg={
										params.chatTemplateMode === mode
											? "var(--wc-accent-blue-bg-8)"
											: "var(--wc-bg-subtle)"
									}
									_hover={{
										borderColor:
											params.chatTemplateMode === mode
												? "var(--wc-accent-blue)"
												: "var(--wc-border-hover)",
									}}
									onClick={() => onParamChange("chatTemplateMode", mode)}
								>
									<Text fontSize="12px" fontWeight="500">
										{mode === "inline"
											? t("common:ui.chatTemplateMode.inline")
											: t("common:ui.chatTemplateMode.file")}
									</Text>
								</Button>
							))}
						</HStack>
						{params.chatTemplateMode === "file" ? (
							<HStack gap="2">
								<Input
									placeholder={t("common:ui.chatTemplateFilePlaceholder")}
									size="sm"
									bg="var(--wc-bg-subtle)"
									borderColor="var(--wc-border-default)"
									color="var(--wc-text-primary)"
									fontFamily='"Geist Mono", monospace'
									fontSize="12px"
									borderRadius="lg"
									_placeholder={{ color: "var(--wc-text-faint)" }}
									_focus={{
										borderColor: "var(--wc-accent-blue)",
										outline: "none",
									}}
									value={params.chatTemplateFile}
									onChange={(event) =>
										onParamChange("chatTemplateFile", event.target.value)
									}
									flex="1"
								/>
								<Button
									size="sm"
									variant="ghost"
									color="var(--wc-text-muted)"
									_hover={{
										color: "var(--wc-accent-blue)",
										bg: "var(--wc-accent-blue-bg-8)",
									}}
									borderRadius="lg"
									minW="8"
									px="0"
									onClick={handleBrowseChatTemplateFile}
									title={t("common:ui.browseChatTemplateFile")}
								>
									<FileInput size={14} />
								</Button>
							</HStack>
						) : (
							<Input
								placeholder={t("common:ui.autoDetect")}
								size="sm"
								bg="var(--wc-bg-subtle)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)"
								fontSize="12px"
								borderRadius="lg"
								_placeholder={{ color: "var(--wc-text-faint)" }}
								_focus={{ borderColor: "var(--wc-accent-blue)", outline: "none" }}
								value={params.chatTemplate}
								onChange={(event) =>
									onParamChange("chatTemplate", event.target.value)
								}
							/>
						)}
					</Box>
					<Box>
						<Text
							fontSize="11px"
							color="var(--wc-text-tertiary)"
							textTransform="uppercase"
							letterSpacing="0.05em"
							mb="1.5"
						>
							{t("common:ui.customFlags")}
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
							onChange={(event) => onParamChange("extraArgs", event.target.value)}
						/>
					</Box>
				</VStack>
			</Card>
		);
	},
);
