import style from './style.scss';

import type {JSX} from 'preact';
import {useRef, useLayoutEffect} from 'preact/hooks';

import {EditorState} from '@codemirror/state';
import {EditorView, keymap, lineNumbers} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';

import {useAppState} from '../../app-state';
import {ChatChangeEvent} from '../../controller/chat-history';
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
        const editorState = EditorState.create({
            doc: chat.history.contents.value,
            extensions: [
                keymap.of([...defaultKeymap, ...historyKeymap]),
                history(),
                lineNumbers(),
                syntaxHighlighting(highlightStyle),
                markdown({base: language}),
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
                        // console.log({fromA, toA, fromB, toB, inserted: inserted.toString()});
                        chat.history.update({
                            from: fromA,
                            to: toA,
                            insert: inserted.toString()
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
        const listener = ({change}: ChatChangeEvent) => {
            if (isDispatchingChanges.current) return;
            isHandlingChanges.current = true;

            const {editorView} = codeMirrorRef.current!;

            editorView.dispatch({
                changes: change
            });
            isHandlingChanges.current = false;
        };

        history.addEventListener('chatchange', listener);

        return () => {
            history.removeEventListener('chatchange', listener);
        };
    }, []);

    return (
        <div className={style.editorWrapper} ref={editorRef} />
    );
};

export default ChatEditor;
