import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { Pencil, X } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { useStore } from "@/store";

export const AnnotationsBox = React.memo(() => {
	const annotations = useStore((s) => s.annotations);
	const removeAnnotation = useStore((s) => s.removeAnnotation);
	const updateAnnotation = useStore((s) => s.updateAnnotation);
	const clearAnnotations = useStore((s) => s.clearAnnotations);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [draftComment, setDraftComment] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const startEdit = useCallback((id: string, currentComment: string) => {
		setEditingId(id);
		setDraftComment(currentComment);
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
			textareaRef.current?.select();
		});
	}, []);

	const saveEdit = useCallback(() => {
		if (editingId) {
			updateAnnotation(editingId, draftComment);
			setEditingId(null);
		}
	}, [editingId, draftComment, updateAnnotation]);

	const cancelEdit = useCallback(() => {
		setEditingId(null);
	}, []);

	if (!annotations.length) return null;

	return (
		<Box
			borderWidth="1px"
			borderColor="var(--wc-border-default)"
			borderRadius="lg"
			bg="var(--wc-bg-elevated)"
			p="3"
			maxH="320px"
			overflow="auto"
		>
			<HStack justify="space-between" align="center" mb="2">
				<Text
					fontSize="calc(var(--chat-font-size) - 3px)"
					fontWeight="600"
					color="var(--wc-text-primary)"
				>
					Annotations ({annotations.length})
				</Text>
				<Box
					as="button"
					display="flex"
					alignItems="center"
					gap="1"
					px="2"
					py="0.5"
					fontSize="calc(var(--chat-font-size) - 3px)"
					borderRadius="sm"
					color="var(--wc-text-muted)"
					_hover={{ bg: "var(--wc-bg-hover)", color: "var(--wc-accent-red)" }}
					onClick={clearAnnotations}
				>
					<X size={12} />
					Clear all
				</Box>
			</HStack>
			<VStack gap="2" align="stretch">
				{annotations.map((annotation, index) => (
					<Box
						key={annotation.id}
						borderWidth="1px"
						borderColor="var(--wc-border-subtle)"
						borderRadius="md"
						p="2"
						bg="var(--wc-bg-subtle)"
						_hover={{ borderColor: "var(--wc-border-default)" }}
						transition="border-color 0.15s ease"
					>
						<HStack justify="space-between" align="center" gap="2">
							<HStack flex="1" overflow="hidden" gap="1" align="flex-start">
								<Box
									as="span"
									fontSize="calc(var(--chat-font-size) - 3px)"
									fontWeight="600"
									color="var(--wc-accent-blue)"
									userSelect="none"
									flexShrink={0}
								>
									{index + 1}.
								</Box>
								<Box
									flex="1"
									minWidth={0}
									maxH="80px"
									overflowY="auto"
									fontSize="calc(var(--chat-font-size) - 2px)"
									color="var(--wc-text-muted)"
									fontFamily="mono"
									fontStyle="italic"
									whiteSpace="pre-wrap"
									wordBreak="break-word"
									lineHeight="1.4"
									borderLeft="3px solid var(--wc-accent-blue)"
									pl="2"
								>
									{annotation.selectedText}
								</Box>
							</HStack>
							<HStack gap="1" flexShrink={0}>
								<Box
									as="button"
									display="flex"
									alignItems="center"
									justifyContent="center"
									width="20px"
									height="20px"
									borderRadius="sm"
									color="var(--wc-text-muted)"
									_hover={{
										bg: "var(--wc-bg-hover)",
										color: "var(--wc-accent-blue)",
									}}
									onClick={() => startEdit(annotation.id, annotation.comment)}
									title="Edit comment"
								>
									<Pencil size={11} />
								</Box>
								<Box
									as="button"
									display="flex"
									alignItems="center"
									justifyContent="center"
									width="20px"
									height="20px"
									borderRadius="sm"
									color="var(--wc-text-muted)"
									_hover={{
										bg: "var(--wc-bg-hover)",
										color: "var(--wc-accent-red)",
									}}
									onClick={() => removeAnnotation(annotation.id)}
									title="Remove"
								>
									<X size={12} />
								</Box>
							</HStack>
						</HStack>
						{editingId === annotation.id ? (
							<Box mt="1.5">
								<TextareaAutosize
									ref={textareaRef}
									value={draftComment}
									onChange={(e) => setDraftComment(e.target.value)}
									onBlur={saveEdit}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											saveEdit();
										}
										if (e.key === "Escape") {
											cancelEdit();
										}
									}}
									placeholder="Type your comment…"
									minRows={1}
									maxRows={6}
									style={{
										width: "100%",
										background: "var(--wc-bg-elevated)",
										border: "1px solid var(--wc-border-default)",
										borderRadius: "6px",
										padding: "5px 8px",
										fontSize: "calc(var(--chat-font-size) - 1px)",
										color: "var(--wc-text-primary)",
										outline: "none",
										resize: "none",
										fontFamily: "inherit",
										lineHeight: "1.4",
									}}
								/>
							</Box>
						) : (
							annotation.comment && (
								<Text
									fontSize="calc(var(--chat-font-size) - 1px)"
									color="var(--wc-text-primary)"
									mt="1"
									lineHeight="1.4"
									whiteSpace="pre-wrap"
									wordBreak="break-word"
								>
									{annotation.comment}
								</Text>
							)
						)}
					</Box>
				))}
			</VStack>
		</Box>
	);
});
