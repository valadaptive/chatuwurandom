import style from './style.scss';

import type {JSX} from 'preact';
import {useMemo} from 'preact/hooks';

import {EditorView, lineNumbers} from '@codemirror/view';
import {markdown} from '@codemirror/lang-markdown';

import {useAppState} from '../../app-state';
import {language, highlightStyle} from '../../text-processing/markdown';
import {syntaxHighlighting} from '@codemirror/language';
import TextEditor from '../TextEditor/TextEditor';

const ChatEditor = (): JSX.Element => {
    const {chat} = useAppState();

    const extensions = useMemo(() => {
        return [
            lineNumbers(),
            syntaxHighlighting(highlightStyle),
            markdown({base: language}),
            EditorView.lineWrapping
        ];
    }, []);

    return <TextEditor className={style.editorWrapper} history={chat.history.value} extensions={extensions} />;
};

export default ChatEditor;
