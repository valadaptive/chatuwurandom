import type {JSX} from 'preact';
import {useRef, useLayoutEffect} from 'preact/hooks';

import {EditorState, Extension, Transaction} from '@codemirror/state';
import {EditorView, KeyBinding, keymap} from '@codemirror/view';
import {defaultKeymap} from '@codemirror/commands';

import {TextChangeEvent, CodeMirrorChangeMetadata, TextHistory} from '../../controller/text-history';

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

const createEditorState = (history: TextHistory, extensions?: Extension[]) => {
    const undoCommand = (): boolean => {
        history.undo();
        return true;
    };

    const redoCommand = (): boolean => {
        history.redo();
        return true;
    };

    const historyBindings: readonly KeyBinding[] = [
        {key: 'Mod-z', run: undoCommand, preventDefault: true},
        {key: 'Mod-y', run: redoCommand, preventDefault: true},
        {key: 'Ctrl-Shift-z', run: redoCommand, preventDefault: true}
    ];

    const stateExtensions = [
        keymap.of([...defaultKeymap, ...historyBindings]),
        EditorState.lineSeparator.of('\n'),
        theme
    ];
    if (extensions) {
        stateExtensions.push(extensions);
    }

    const editorState = EditorState.create({
        doc: history.contents.value,
        extensions: stateExtensions
    });

    return editorState;
};

type TextEditorProps = {
    className?: string,
    history: TextHistory,
    /**
     * List of CodeMirror extensions to initialize the editor with. Note that passing in a new array will reinitialize
     * the editor--make sure you only create a new array of extensions if you actually want to do that!
     */
    extensions?: Extension[]
};

const TextEditor = (
    {className, history, extensions}: TextEditorProps
): JSX.Element => {
    const editorRef = useRef<HTMLDivElement>(null);
    const codeMirrorRef = useRef<{editorView: EditorView}>();
    // We don't want to handle ChatChange events when we're the ones dispatching them--that would be an infinite loop
    const isDispatchingChanges = useRef(false);
    // Also don't dispatch ChatChange events when we're handling them
    const isHandlingChanges = useRef(false);

    useLayoutEffect(() => {
        const editorView = new EditorView({
            parent: editorRef.current ?? undefined,
            dispatch (tr, view) {
                isDispatchingChanges.current = true;

                if (!isHandlingChanges.current) {
                    tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                        history.update({
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

        codeMirrorRef.current = {editorView};
    }, [history]);

    useLayoutEffect(() => {
        codeMirrorRef.current!.editorView.setState(createEditorState(history, extensions));
    }, [history, extensions]);

    useLayoutEffect(() => {
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
    }, [history]);

    return (
        <div className={className} ref={editorRef} />
    );
};

export default TextEditor;
