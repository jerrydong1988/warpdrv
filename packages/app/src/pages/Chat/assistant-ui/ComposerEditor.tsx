import { useTranslation } from 'react-i18next';
import { useImperativeHandle, forwardRef, useRef } from "react";
import { useEditor, EditorContent, Extension, type Editor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { ComposerPlaceholder } from "./ComposerPlaceholder";
import { SlashCommandNode } from "./slash-command/SlashCmdNode";
import { docToString, extractCommands } from "./docToString";
import { setActiveComposerEditor, clearActiveComposerEditor } from "./composerEditorRegistry";
import { useStore } from "@/store";

export interface IWarpComposerEditorRef {
	insertText: (text: string) => void;
	focus: () => void;
	clear: () => void;
	getEditor: () => Editor | null;
}

interface IProps {
	placeholder?: string;
	onChangeText: (text: string) => void;
	onEnter: () => void;
	canSend?: () => boolean;
	className?: string;
}

// drives Enter=send, Shift-Enter=newline
const makeKeymap = (getOnEnter: () => () => void, getCanSend: () => (() => boolean) | undefined) =>
	Extension.create({
		name: "warpComposerKeymap",
		addKeyboardShortcuts() {
			return {
				Enter: () => {
					const canSend = getCanSend();
					if (canSend && !canSend()) return false;
					const json = this.editor.getJSON();
const text = docToString(json).trim();
				const commands = extractCommands(json);
				if (!text && commands.length === 0) return false;
				getOnEnter()();
				return true;
				},
				"Shift-Enter": () => this.editor.commands.setHardBreak(),
			};
		},
	});

export const ComposerEditor = forwardRef<IWarpComposerEditorRef, IProps>((props, ref) => {
	const { t } = useTranslation('chat');
	const setPendingSlashCommands = useStore(s => s.setPendingSlashCommands);
	const slashCommands = useStore(s => s.slashCommands);
	const slashCommandsRef = useRef(slashCommands);
	slashCommandsRef.current = slashCommands;
	const chatFontSize = useStore(s => s.settings.chatFontSize ?? 14);
	const chatFontFamily = useStore(s => s.settings.chatFontFamily ?? '');
	const onEnterRef = useRef(props.onEnter);
	onEnterRef.current = props.onEnter;
	const canSendRef = useRef(props.canSend);
	canSendRef.current = props.canSend;
	const editor = useEditor({
		extensions: [
			Document,
			Paragraph,
			Text,
			HardBreak,
			makeKeymap(() => onEnterRef.current, () => canSendRef.current),
			SlashCommandNode,
			ComposerPlaceholder.configure({
				placeholder: props.placeholder ?? t('composer.sendMessagePlaceholder'),
				resolveCommandPlaceholder: (name: string) => {
					const command = slashCommandsRef.current[name];
					if (!command?.consumesInput) return null;
					return command.inputPlaceholder ?? null;
				},
			}),
		],
		editorProps: {
			attributes: {
				class: "aui-composer-input",
				"aria-label": "Message input",
				style: `outline: none; min-height: 50px; font-size: ${chatFontSize}px;${chatFontFamily ? ` font-family: ${chatFontFamily};` : ''}`,
			},
		},
		onUpdate: ({ editor }) => {
			const json = editor.getJSON();
			props.onChangeText(docToString(json));
			setPendingSlashCommands(extractCommands(json));
		},
		onCreate: ({ editor }) => {
			//console.log("[register] onCreate fired", !!editor);
			setActiveComposerEditor(editor);
		},
		onDestroy: () => {
			if (editor) clearActiveComposerEditor(editor);
		},
	});

	useImperativeHandle(ref, () => ({
		insertText: (text: string) => {
			editor?.chain().focus().insertContent(text).run();
		},
		focus: () => editor?.commands.focus(),
		clear: () => editor?.commands.clearContent(true),
		getEditor: () => editor,
	}), [editor]);

	return <EditorContent editor={editor} className={props.className}/>;
});

ComposerEditor.displayName = "ComposerEditor";
