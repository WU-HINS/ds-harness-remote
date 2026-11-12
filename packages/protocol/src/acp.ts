/** Agent Client Protocol (ACP) capability values, endpoints and payload shapes. */

/** Generic Agent Client Protocol capability and bounded gateway limits. */
export const ACP_CAPABILITY = 'agent.acp.v1' as const
export const ACP_PI_CAPABILITY = 'agent.acp.pi.v1' as const
export const ACP_WORKSPACE_FILES_CAPABILITY = 'agent.acp.workspace-files.v1' as const
export const ACP_TERMINAL_CAPABILITY = 'agent.acp.terminal.v1' as const
export const ACP_ANTIGRAVITY_MODELS_CAPABILITY = 'agent.acp.antigravity.models.v1' as const
export const ACP_ANTIGRAVITY_MODEL_LOAD_CAPABILITY = 'agent.acp.antigravity.model-load.v1' as const
export const ACP_OPENCODE_CAPABILITY = 'agent.acp.opencode.v1' as const
export const ACP_OPENCODE_ARCHIVE_CAPABILITY = 'agent.acp.opencode.archive.v1' as const
export const ACP_TOOL_CALL_ENDPOINTS = ['workspaceFiles/list', 'workspaceFiles/stat', 'workspaceFiles/read', 'workspaceFiles/readBytes', 'workspaceFiles/readAll',
  'terminal/environment', 'terminal/shells', 'terminal/list', 'terminal/create', 'terminal/write', 'terminal/resize', 'terminal/rename', 'terminal/close'] as const
export const ACP_TOOL_STREAM_ENDPOINTS = ['workspaceFiles/changes', 'terminal/follow', 'terminal/retain'] as const
export interface AcpModelSelection { provider: string; model: string; reasoningEffort?: string }
export interface AcpSessionModels {
  current: AcpModelSelection; routable: boolean;
  groups: Array<{ id: string; name: string; models: Array<{ id: string; name: string; reasoning?: { efforts: Array<{ id: string; name: string }>; defaultEffort?: string } }> }>;
  failures: Array<{ id: string; name: string; message: string }>;
}
export const MAX_ACP_PROMPT_BYTES = 64 * 1024
export const MAX_ACP_UPDATE_BYTES = 512 * 1024

export type AcpBackend = 'cursor' | 'claude' | 'opencode' | 'pi' | 'hermes' | 'antigravity' | (string & {})
export interface AcpInitializeParams { protocolVersion: 1; backend?: AcpBackend }
export interface AcpInitializeResult { protocolVersion: 1; capability: typeof ACP_CAPABILITY; backend: AcpBackend; capabilities: string[]; availableBackends?: AcpBackend[] }
export interface AcpSessionParams { sessionId?: string; cwd?: string; mode?: string; backend?: AcpBackend }
export interface AcpPromptParams { sessionId: string; prompt: string; images?: Array<{ mimeType: string; data: string }> }
export interface AcpPermissionResponseParams { sessionId: string; requestId: string; decision: 'allow_once' | 'deny' }
export interface AcpCancelParams { sessionId: string }
export interface AcpSetModeParams { sessionId: string; mode: string }
export interface AcpSessionUpdate { sessionId: string; update: unknown; seq: number }

/** Fixed allowlisted Agent ACP call carried inside Remote. */
export interface AgentAcpCallParams {
  method: string
  params: unknown
}

export interface AcpSessionArchivedData { backend: 'opencode'; sessionId: string; archived: true }

export interface AgentAcpRespondParams {
  requestHandle: string
  decision: 'allow-once' | 'reject-once' | 'cancel'
  /** Optional structured answer for backend extension methods (ask_question / create_plan). */
  result?: unknown
}

export type AcpWorkspaceToolCallEndpoint = 'workspaceFiles/list' | 'workspaceFiles/stat' | 'workspaceFiles/read' | 'workspaceFiles/readBytes' | 'workspaceFiles/readAll'
  | 'terminal/environment' | 'terminal/shells' | 'terminal/list' | 'terminal/create' | 'terminal/write' | 'terminal/resize' | 'terminal/rename' | 'terminal/close'
export type AcpWorkspaceToolStreamEndpoint = 'workspaceFiles/changes' | 'terminal/follow' | 'terminal/retain'
export interface AcpWorkspaceToolParams { sessionId: string; backend: 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude' | 'hermes'; endpoint: AcpWorkspaceToolCallEndpoint; args: Record<string, unknown> }
export interface AcpModelParams { sessionId: string; backend: 'cursor' | 'claude' | 'antigravity' | 'pi' | 'opencode' }
export interface AcpModelSelectionParams extends AcpModelParams { model: string; reasoningEffort?: string }
export interface AgentAcpStreamOpenParams {
  streamId: string
  sessionId: string
  tool?: { backend: 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude' | 'hermes'; endpoint: AcpWorkspaceToolStreamEndpoint; args: Record<string, unknown> }
}

export interface AgentAcpStreamCloseParams {
  streamId: string
}

export interface AgentAcpFrameData {
  streamId: string
  frame: {
    method: string
    params: unknown
  }
}

export interface AgentAcpStreamClosedData {
  streamId: string
  reason: 'cancelled' | 'completed' | 'failed' | 'peer-disconnected'
}

export interface AgentAcpTransferOpenParams {
  transferId: string
  totalBytes: number
  totalChunks: number
}

export interface AgentAcpTransferChunkParams {
  transferId: string
  index: number
  data: string
}

export interface AgentAcpTransferCommitParams { transferId: string }
export interface AgentAcpTransferReadParams { transferId: string; index: number }
export interface AgentAcpTransferCloseParams { transferId: string }

export type AgentAcpTransferCommitResult =
  | { kind: 'inline'; response: unknown }
  | { kind: 'chunked'; transferId: string; totalBytes: number; totalChunks: number }

export interface AgentAcpTransferReadResult {
  transferId: string
  index: number
  data: string
}
