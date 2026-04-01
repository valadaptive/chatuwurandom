import style from './style.scss';

import {useLayoutEffect, useMemo} from 'preact/hooks';

import GrammarEditor from '../GrammarEditor/GrammarEditor';
import {TextChangeEvent, TextHistory} from '../../controller/text-history';
import {parser} from '@lezer/lezer';
import {batch, useComputed, useSignal, useSignalEffect} from '@preact/signals';
import {Tree, TreeFragment} from '@lezer/common';
import {useAppState} from '../../app-state';
import {SyntaxNodeCache} from '../../util/syntax-node-cache';


const GrammarDisplay = ({history}: {history: TextHistory}) => {
    const treeSignal = useSignal<{tree: Tree, fragments: readonly TreeFragment[]} | null>(null);
    const doc = useSignal('');
    const syntaxCache = useMemo(() => new SyntaxNodeCache(), []);

    useLayoutEffect(() => {
        const tree = parser.parse(history.contents.value);
        batch(() => {
            treeSignal.value = {tree, fragments: TreeFragment.addTree(tree)};
            doc.value = history.contents.value;
        });

        const listener = ({change}: TextChangeEvent) => {
            let {tree, fragments} = treeSignal.value!;

            fragments = TreeFragment.applyChanges(fragments, [{
                fromA: change.from,
                toA: change.to,
                fromB: change.from,
                toB: change.from + change.inserted.length
            }]);
            tree = parser.parse(history.contents.value, fragments);
            fragments = TreeFragment.addTree(tree, fragments);

            batch(() => {
                treeSignal.value = {tree, fragments};
                doc.value = history.contents.value;
            });
        };

        history.addEventListener('textchange', listener);

        return () => {
            history.removeEventListener('textchange', listener);
        };
    }, [history]);

    /*useSignalEffect(() => {
        console.log(treeSignal.value);
    });*/

    const gbnf = useComputed(() => {
        if (!treeSignal.value) return null;
        return syntaxCache.mapNodes(
            treeSignal.value.tree,
            doc.value,
            (node, children: unknown[] | null, doc, depth): unknown => {
                // Whitespace, etc. (we don't care)
                if (typeof node === 'string') return '';
                const fragment = doc.slice(node.from, node.to);

                console.log(node.type.name, children, doc.slice(node.from, node.to), depth);
                switch (node.type.name) {
                    case 'Literal': return fragment;
                    case 'ParenExpression': return `(${children?.join('') ?? ''})`;
                    case 'CharClass': {
                        switch (fragment) {
                            case '@asciiLetter': return '[a-zA-Z]';
                            case '@asciiUppercase':
                            case '@asciiUpperCase': return '[A-Z]';
                            case '@asciiLowercase':
                            case '@asciiLowerCase': return '[a-z]';
                            case '@digit': return '[0-9]';
                            case '@whitespace':
                                // eslint-disable-next-line max-len
                                return '[\\u0009-\\u000d|\\u0020|\\u0085|\\u00a0|\\u1680|\\u2000-\\u200a|\\u2028|\\u2029|\\u202f|\\u205f|\\u3000]';
                            default: {
                                // eslint-disable-next-line no-console
                                console.warn(`Unknown Lezer char class ${fragment}`);
                                return '[ ]';
                            }
                        }
                    }
                    case 'RuleName': {
                        let output = '';
                        for (let i = 0; i < fragment.length; i++) {
                            const char = fragment.charAt(i);
                            if (
                                (char >= 'a' && char <= 'z') ||
                                char === '-'
                            ) {
                                output += char;
                            } else if (char >= 'A' && char <= 'Z') {
                                // Convert uppercase to lowercase letters preceded by dashes
                                output += `-${char.toLowerCase()}`;
                            } else {
                                // TODO: GBNF only supports ASCII lowercase + dashes in names. Do we need to
                                // disambiguate?
                                output += '-';
                            }
                        }
                        return output;
                    }
                    case 'Body': return children!.join('');
                    case 'TopSkipDeclaration':
                    case 'RuleDeclaration': {
                        const childrenStrs = children as string[];
                        const name = childrenStrs[0];
                        const body = childrenStrs[childrenStrs.length - 1];
                        return `${name} ::= (${body})\n`;
                    }

                    case 'Repeat': return `${children?.join('') ?? ''}*`;
                    case 'Repeat1': return `${children?.join('') ?? ''}+`;
                    case 'Optional': return `${children?.join('') ?? ''}?`;

                    case 'Choice': return children!.filter(child => child !== '').join(' | ');
                    case 'Sequence': return children!.filter(child => child !== '').join(' --skipped-tokens? ');
                    case 'CharSet': return fragment.slice(1); // TODO: what if it starts with "^"?
                    case 'InvertedCharSet': {
                        const body = fragment.slice(2, -1);
                        return `[^${body}]`;
                    }

                    case 'Specialization': {
                        const argList = children![1];
                        if (!Array.isArray(argList)) {
                            throw new Error('Specialization arg list should be second');
                        }
                        if (argList.length !== 2) {
                            throw new Error('Specialization rule should have 2 arguments');
                        }
                        return argList[1];
                    }

                    // Not necessary for GBNF
                    case 'DetectDelimDeclaration': return '';
                    case 'PrecedenceMarker': return '';
                    case 'PrecedenceName': return '';
                    case 'Precedence': return '';
                    case 'PrecedenceDeclaration': return '';
                    case 'TokenPrecedenceDeclaration': return '';
                    case 'PrecedenceBody': return '';

                    case 'ArgList': return children!.filter(child => child !== '');

                    // Leaf tokens; we don't care about these
                    case '+':
                    case '*':
                    case '?':
                    case '|':
                    case '!':
                    case '{':
                    case '}':
                    case '[':
                    case ']':
                    case '(':
                    case ')': return '';

                    case '@tokens':
                    case '@precedence':
                    case '@left':
                    case '@right':
                    case '@cut':
                    case '@detectDelim':
                    case '@specialize':
                    case '@extend': return '';

                    case '@top': return 'root';
                    case '@skip': return '--skipped-tokens';

                    case 'TokensBody':
                    case 'TokensDeclaration':
                    case 'Grammar': return children?.join('') ?? '';

                    default: {
                        // eslint-disable-next-line no-console
                        console.warn(`Unknown node type ${node.type.name}`);
                        return 'ERROR';
                    }
                }
            });
    });

    useSignalEffect(() => {
        console.log(gbnf.value);
    });

    return null;
};

const GrammarPane = () => {
    const {grammar} = useAppState();
    return (
        <div className={style.grammarPane}>
            <header>Grammar editor</header>
            <GrammarEditor />
            <GrammarDisplay history={grammar.value} />
        </div>
    );
};

export default GrammarPane;
