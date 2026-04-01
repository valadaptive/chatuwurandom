import {parser as baseParser} from '@lezer/markdown';

const customParser = baseParser.configure({});

export {customParser as parser};
