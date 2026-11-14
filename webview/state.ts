import type { EditorView } from 'codemirror';
import type { Editor } from '@milkdown/core';

// Declare VS Code API so TypeScript doesn't complain
declare function acquireVsCodeApi(): any;

export const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

export const state = {
    isUpdatingFromVSCode: false,
    isSourceMode: false,
    forceSync: false,
    // What the host last sent, and the editor's own serialisation of it. An
    // update from the host must never be echoed back as an edit.
    lastExternalText: null as string | null,
    externalSerialised: null as string | null,
    editedSinceExternal: false,
    cmView: null as EditorView | null,
    editor: null as Editor | null,
    currentZoom: 14,
    lastMarkdown: '',
    currentFrontmatter: '',
    publicPathPrefix: '',
    workspaceRoot: '',
    configLang: 'en'
};

const langMeta = document.querySelector('meta[name="config-lang"]');
if (langMeta) {
    state.configLang = langMeta.getAttribute('content') || 'en';
}
