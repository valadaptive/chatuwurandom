import style from './style.scss';

import type {JSX} from 'preact';
import {useMemo} from 'preact/hooks';

import {EditorView, lineNumbers} from '@codemirror/view';
import {lezer} from '@codemirror/lang-lezer';

import {useAppState} from '../../app-state';
import {highlightStyle} from '../../text-processing/lezer';
import {syntaxHighlighting} from '@codemirror/language';
import TextEditor from '../TextEditor/TextEditor';

const GrammarEditor = (): JSX.Element => {
    const {grammar} = useAppState();

    const extensions = useMemo(() => {
        return [
            lineNumbers(),
            syntaxHighlighting(highlightStyle),
            lezer(),
            EditorView.lineWrapping
        ];
    }, []);

    return <TextEditor className={style.editorWrapper} history={grammar.value} extensions={extensions} />;
};

export default GrammarEditor;
