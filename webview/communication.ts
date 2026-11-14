import { serializerCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import { clampPosition } from '../src/ai/reference';
import { currentSelectionInfo } from './utils/selectionInfo';
import { setUnresolvedTargets } from './plugins/wikilink';
import { splitWikilinks } from '../src/links/wikilink';
import {
  callCommand,
  insert,
  replaceAll,
} from '@milkdown/utils';
import {
  toggleLinkCommand,
  wrapInHeadingCommand,
  createCodeBlockCommand,
  wrapInBlockquoteCommand,
  toggleStrongCommand,
  toggleEmphasisCommand,
} from '@milkdown/preset-commonmark';
import { editorViewCtx } from '@milkdown/core';
import { state, vscode } from './state';
import { updateMetadataUI, frontmatterRegex } from './ui/metadata';
import { initCodeMirror } from './editor/codemirror';
import { insertFootnote } from './utils/markdown';

/** The element that actually scrolls the document. */
function scrollContainer(): Element | null {
  let el: Element | null = document.querySelector('.ProseMirror');
  while (el && el !== document.documentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return document.scrollingElement;
}

export function setupMessageListener() {
  window.addEventListener('message', async (event) => {
    const message = event.data;
    switch (message.type) {
      case 'update':
        if (state.isSourceMode) {
          if (!state.cmView) {
            initCodeMirror(message.text);
          } else {
            if (state.cmView.state.doc.toString() === message.text) break;
            state.isUpdatingFromVSCode = true;
            // An external edit (an AI assistant, git) replaces the text; keep
            // the cursor and the scroll position where they were.
            const cmHead = state.cmView.state.selection.main.head;
            const cmScroll = state.cmView.scrollDOM.scrollTop;
            state.cmView.dispatch({
              changes: { from: 0, to: state.cmView.state.doc.length, insert: message.text },
              selection: { anchor: clampPosition(cmHead, message.text.length) },
            });
            state.cmView.scrollDOM.scrollTop = cmScroll;
            setTimeout(() => {
              state.isUpdatingFromVSCode = false;
            }, 50);
          }
        } else {
          if (state.editor) {
            state.isUpdatingFromVSCode = true;
            let markdownToRender = message.text;
            const match = message.text.match(frontmatterRegex);
            if (match) {
              state.currentFrontmatter = match[0];
              updateMetadataUI(match[1]);
              markdownToRender = message.text.slice(match[0].length);
            } else {
              state.currentFrontmatter = '';
              updateMetadataUI('');
            }
            if (message.text === state.lastExternalText && !state.editedSinceExternal) {
              // The same text again and no edit in between: do not rebuild, so
              // the cursor stays put.
              state.isUpdatingFromVSCode = false;
              break;
            }
            state.lastExternalText = message.text;
            state.editedSinceExternal = false;
            state.lastMarkdown = markdownToRender;

            // An external edit (an AI assistant, git) replaces the document;
            // keep the cursor and the scroll position where they were.
            const scroller = scrollContainer();
            const scrollTop = scroller?.scrollTop ?? 0;
            let anchor = -1;
            state.editor.action((ctx) => { anchor = ctx.get(editorViewCtx).state.selection.anchor; });

            state.editor.action(replaceAll(markdownToRender));

            state.editor.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              if (anchor < 0) return;
              try {
                const pos = view.state.doc.resolve(clampPosition(anchor, view.state.doc.content.size));
                view.dispatch(view.state.tr.setSelection(TextSelection.near(pos)));
              } catch { /* the old position has no equivalent */ }
              // Remember how the editor itself writes this document, so the
              // debounced change listener can tell it from a real edit.
              try { state.externalSerialised = ctx.get(serializerCtx)(view.state.doc); } catch { state.externalSerialised = null; }
            });
            if (scroller) {
              scroller.scrollTop = scrollTop;
              requestAnimationFrame(() => { scroller.scrollTop = scrollTop; });
            }
            setTimeout(() => {
              state.isUpdatingFromVSCode = false;
            }, 50);
          }
        }
        break;

      case 'setMode':
        const themeClass = message.theme === 2 ? 'vscode-dark' : 'vscode-light';
        document.body.className = themeClass;
        break;
      
      case 'linkState':
        setUnresolvedTargets(message.unresolved);
        break;

      case 'insertWikilink':
        // The `[[` that opened the picker is replaced by the finished link.
        if (state.editor && typeof message.text === 'string') {
          state.forceSync = true;
          state.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { from } = view.state.selection;
            const before = view.state.doc.textBetween(Math.max(0, from - 2), from);
            const cut = before === '[[' ? 2 : before.endsWith('[') ? 1 : 0;
            const [part] = splitWikilinks(message.text);
            if (part && typeof part !== 'string') {
              const node = view.state.schema.nodes.wikilink.create(part);
              view.dispatch(view.state.tr.replaceWith(from - cut, from, node).scrollIntoView());
              view.focus();
            }
          });
          setTimeout(() => { state.forceSync = false; }, 100);
        }
        break;

      case 'insertText':
        if (state.isSourceMode && state.cmView) {
          const selection = state.cmView.state.selection.main;
          state.cmView.dispatch({
            changes: { from: selection.from, to: selection.to, insert: message.text },
            selection: { anchor: selection.from + message.text.length }
          });
        } else if (state.editor) {
          state.forceSync = true;
          state.editor.action(insert(message.text));
          setTimeout(() => { state.forceSync = false; }, 100);
        }
        break;

      case 'replaceFootnote':
        if (state.editor) {
          state.forceSync = true;
          state.editor.action((ctx: any) => {
            const view = ctx.get(editorViewCtx);
            const { state: pmState, dispatch } = view;
            
            let tr = pmState.tr;
            let posOffset = 0;
            
            pmState.doc.descendants((node: any, pos: number) => {
              if (node.isText && node.text) {
                const globalPos = pos + posOffset;
                const match = node.text.match(/\[\^([^\]]+)\](?!:)/);
                if (match && match[1] === message.oldId) {
                  const start = globalPos + match.index!;
                  const end = start + match[0].length;
                  tr = tr.replaceWith(start, end, pmState.schema.text(`[^${message.newId}]`));
                  posOffset += (message.newId.length - message.oldId.length);
                } else {
                  const defMatch = node.text.match(new RegExp(`^\\[\\^${message.oldId}\\]:`));
                  if (defMatch) {
                    const start = globalPos;
                    const end = start + defMatch[0].length;
                    tr = tr.replaceWith(start, end, pmState.schema.text(`[^${message.newId}]:`));
                    posOffset += (message.newId.length - message.oldId.length);
                  }
                }
              }
              return true;
            });
            
            if (tr.docChanged) dispatch(tr);
          });
        }
        break;

      case 'insertLinkWithUrl':
        if (state.editor && message.url) {
          state.forceSync = true;
          state.editor.action(callCommand(toggleLinkCommand.key, { href: message.url }));
          setTimeout(() => { state.forceSync = false; }, 100);
        }
        break;

      case 'insertImage':
        if (state.editor) {
          state.forceSync = true;
          state.editor.action((ctx: any) => {
             const view = ctx.get(editorViewCtx);
             const { state: pmState, dispatch } = view;
             const imageNode = pmState.schema.nodes.image.create({ src: message.url, alt: 'image' });
             const pastePos = message.pastePos !== undefined ? message.pastePos : pmState.selection.from;
             const tr = pmState.tr.insert(pastePos, imageNode);
             dispatch(tr);
          });
          setTimeout(() => { state.forceSync = false; }, 100);
        }
        break;

      case 'config':
        state.publicPathPrefix = message.publicPathPrefix;
        state.workspaceRoot = message.workspaceRoot;
        break;

      case 'command':
        handleVSCodeCommand(message.command);
        break;
    }
  });
}

export function handleVSCodeCommand(command: string) {
  if (!state.editor) return;

  const withForceSync = (action: () => void) => {
    state.forceSync = true;
    action();
    setTimeout(() => { state.forceSync = false; }, 100);
  };

  switch (command) {
    case 'sendToAI':
    case 'revealSelection':
    case 'copyReference':
      // The host turns this into a file reference with a line range.
      if (vscode) vscode.postMessage({ type: command, ...currentSelectionInfo() });
      break;
    case 'insertLink':
      withForceSync(() => state.editor!.action(callCommand(toggleLinkCommand.key)));
      break;
    case 'save':
      if (vscode) vscode.postMessage({ type: 'save' });
      break;
    case 'insertTable':
      withForceSync(() => state.editor!.action(
        insert(`\n| Column 1 | Column 2 |\n| -------- | -------- |\n| Text     | Text     |\n`),
      ));
      break;
    case 'insertHeading1':
      withForceSync(() => state.editor!.action(callCommand(wrapInHeadingCommand.key, 1)));
      break;
    case 'insertHeading2':
      withForceSync(() => state.editor!.action(callCommand(wrapInHeadingCommand.key, 2)));
      break;
    case 'insertHeading3':
      withForceSync(() => state.editor!.action(callCommand(wrapInHeadingCommand.key, 3)));
      break;
    case 'insertHeading4':
      withForceSync(() => state.editor!.action(callCommand(wrapInHeadingCommand.key, 4)));
      break;
    case 'insertHeading5':
      withForceSync(() => state.editor!.action(callCommand(wrapInHeadingCommand.key, 5)));
      break;
    case 'insertHeading6':
      withForceSync(() => state.editor!.action(callCommand(wrapInHeadingCommand.key, 6)));
      break;
    case 'insertCodeBlock':
      withForceSync(() => state.editor!.action(callCommand(createCodeBlockCommand.key)));
      break;
    case 'insertBlockquote':
      withForceSync(() => state.editor!.action(callCommand(wrapInBlockquoteCommand.key)));
      break;
    case 'insertImage':
      withForceSync(() => state.editor!.action(insert(`\n![image]()\n`)));
      break;
    case 'toggleBold':
      withForceSync(() => state.editor!.action(callCommand(toggleStrongCommand.key)));
      break;
    case 'toggleItalic':
      withForceSync(() => state.editor!.action(callCommand(toggleEmphasisCommand.key)));
      break;
  }
}
