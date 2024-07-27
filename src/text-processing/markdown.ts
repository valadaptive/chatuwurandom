import {HighlightStyle, Language, defineLanguageFacet} from '@codemirror/language';
import {parser} from '@lezer/markdown';
import {tags as t} from '@lezer/highlight';

// In case I need to make any future customizations
const customParser = parser.configure({});

export {customParser as parser};

export const language = new Language(
    defineLanguageFacet({commentTokens: {block: {open: '<!--', close: '-->'}}}),
    customParser
);

export const highlightStyle = HighlightStyle.define([
    {tag: t.url, color: '#56d9d9', textDecoration: 'underline'},
    {tag: t.strong, fontWeight: 'bold'},
    {tag: t.emphasis, fontStyle: 'italic'},
    {tag: t.processingInstruction, color: '#98e478'},
    {tag: [t.labelName, t.string], color: '#ffb240'},
    {tag: t.heading, color: '#ff77b9', fontWeight: 'bold'},
    {tag: t.comment, color: '#767e9c'},
    {tag: t.contentSeparator, color: '#a2acbc'}
]);
