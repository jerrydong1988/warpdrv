import { nanoid } from "nanoid";

/** Generate a thread ID — prefix `t_` */
export const genThreadId = () => `t_${nanoid(6)}`;

/** Generate a message ID — prefix `m_` */
export const genMessageId = () => `m_${nanoid(6)}`;

/** Generate a message part ID (text, reasoning, attachment, tool_call) — prefix `p_` */
export const genPartId = () => `p_${nanoid(6)}`;

/** Generate a tool-call correlation ID — prefix `c_` */
export const genToolCallId = () => `c_${nanoid(6)}`;

/** Generate a folder/workspace ID — prefix `f_` */
export const genFolderId = () => `f_${nanoid(6)}`;

/** Generate a chat preset ID — prefix `s_` */
export const genPresetId = () => `s_${nanoid(6)}`;

/** Generate an access token ID — prefix `k_` */
export const genTokenId = () => `k_${nanoid(6)}`;

/** Generate a chat prompt ID — prefix `g_` */
export const genPromptId = () => `g_${nanoid(6)}`;
