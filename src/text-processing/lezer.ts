import {HighlightStyle} from '@codemirror/language';
import {tags as t} from '@lezer/highlight';

export const highlightStyle = HighlightStyle.define([
    {tag: t.operator, color: '#56d9d9'},
    {tag: t.keyword, color: '#98e478'},
    {tag: t.string, color: '#ffb240'},
    {tag: t.bracket, color: '#ff77b9'},
    {tag: t.comment, color: '#767e9c'},
    {tag: t.name, color: '#a2acbc'}
]);
