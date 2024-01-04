import style from './style.scss';

import type {JSX} from 'preact';
import {useRef, useLayoutEffect} from 'preact/hooks';

import {EditorState, Transaction} from '@codemirror/state';
import {EditorView, KeyBinding, keymap, lineNumbers} from '@codemirror/view';
import {defaultKeymap} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';

import {useAppState} from '../../app-state';
import {TextChangeEvent, CodeMirrorChangeMetadata} from '../../controller/text-history';
import {language, highlightStyle} from '../../text-processing/markdown';
import {syntaxHighlighting} from '@codemirror/language';

const theme = EditorView.theme({
    '&': {
        width: '100%',
        height: '100%'
    },
    '.cm-gutters': {
        backgroundColor: 'var(--base-color-secondary)'
    },
    '.cm-scroller': {
        borderRadius: 'var(--corner-radius)',
        backgroundColor: 'var(--base-color-tertiary)'
    },
    '.cm-content': {
        caretColor: 'var(--text)'
    }
}, {dark: true});

const ChatEditor = (): JSX.Element => {
    const {chat} = useAppState();
    const editorRef = useRef<HTMLDivElement>(null);
    const codeMirrorRef = useRef<{editorView: EditorView, editorState: EditorState}>();
    // We don't want to handle ChatChange events when we're the ones dispatching them--that would be an infinite loop
    const isDispatchingChanges = useRef(false);
    // Also don't dispatch ChatChange events when we're handling them
    const isHandlingChanges = useRef(false);

    useLayoutEffect(() => {
        const undoCommand = (): boolean => {
            chat.history.undo();
            return true;
        };

        const redoCommand = (): boolean => {
            chat.history.redo();
            return true;
        };

        const historyBindings: readonly KeyBinding[] = [
            {key: 'Mod-z', run: undoCommand, preventDefault: true},
            {key: 'Mod-y', run: redoCommand, preventDefault: true},
            {key: 'Ctrl-Shift-z', run: redoCommand, preventDefault: true}
        ];

        const editorState = EditorState.create({
            doc: chat.history.contents.value,
            extensions: [
                keymap.of([...defaultKeymap, ...historyBindings]),
                EditorState.lineSeparator.of('\n'),
                lineNumbers(),
                syntaxHighlighting(highlightStyle),
                markdown({base: language}),
                EditorView.lineWrapping,
                theme
            ]
        });
        const editorView = new EditorView({
            state: editorState,
            parent: editorRef.current ?? undefined,
            dispatch (tr, view) {
                isDispatchingChanges.current = true;

                if (!isHandlingChanges.current) {
                    tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                        chat.history.update({
                            from: fromA,
                            to: toA,
                            inserted: inserted.toString(),
                            timestamp: tr.annotation(Transaction.time)!,
                            metadata: {
                                codemirror: new CodeMirrorChangeMetadata(tr.startState.selection, tr.newSelection)
                            }
                        });
                    });
                }
                view.update([tr]);
                isDispatchingChanges.current = false;
            }
        });

        codeMirrorRef.current = {editorView, editorState};
    }, []);

    useLayoutEffect(() => {
        const history = chat.history;
        const listener = ({change}: TextChangeEvent) => {
            if (isDispatchingChanges.current) return;
            isHandlingChanges.current = true;

            const {editorView} = codeMirrorRef.current!;

            editorView.dispatch({
                changes: {
                    from: change.from,
                    to: change.to,
                    insert: change.inserted
                },
                selection: change.metadata?.codemirror?.newSelection
            });
            isHandlingChanges.current = false;
        };

        history.addEventListener('textchange', listener);

        return () => {
            history.removeEventListener('textchange', listener);
        };
    }, []);

    return (
        <div className={style.editorWrapper} ref={editorRef} />
    );
};

export default ChatEditor;
