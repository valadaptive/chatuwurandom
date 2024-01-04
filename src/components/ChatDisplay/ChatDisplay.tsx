import style from './style.scss';

import type {JSX} from 'preact';
import {batch, useComputed, useSignal} from '@preact/signals';
import {useLayoutEffect, useMemo, useRef} from 'preact/hooks';
import {Tree, type SyntaxNodeRef, TreeFragment} from '@lezer/common';

import {useAppState} from '../../app-state';
import {MarkdownCache, parser} from '../../text-processing/markdown';
import {TextChangeEvent} from '../../controller/text-history';

const DEBUG: boolean = false;

const renderDebugMarkdown = (
    node: SyntaxNodeRef | string,
    children: (JSX.Element | string)[] | null,
    doc: string,
    depth: number
) => {
    if (typeof node === 'string') return `${'    '.repeat(depth)}${JSON.stringify(node)}\n`;
    return <span>
        {`${'    '.repeat(depth)}`}(<span key={Math.random()} className={style.markdownNode}>{node.node.type.name} {node.from}-{node.to}</span>
        {children ? <><br />
            <span>{children}</span>
            {`${'    '.repeat(depth)}`})</> : ')'}<br />
    </span>;
};

enum SpecialNodeType {
    CodeText,
    URL,
    LinkTitle,
    ListMark,
    ListItem
}

type SpecialNode = {
    specialNodeType: SpecialNodeType.CodeText | SpecialNodeType.ListMark | SpecialNodeType.LinkTitle,
    contents: string
} | {
    specialNodeType: SpecialNodeType.URL,
    contents: string | null
} | {
    specialNodeType: SpecialNodeType.ListItem,
    mark: string | null,
    contents: JSX.Element
};

type ChildNode = JSX.Element | string | null | SpecialNode | ChildNode[];

const isSpecialNode = (node: ChildNode): node is SpecialNode =>
    node !== null && typeof node === 'object' && 'specialNodeType' in node;

const htmlEntityMap = new Map<string, string>();
// This is probably slow and convoluted, but nobody uses HTML entities in Markdown and it's not worth installing an npm
// package containing the bajillion named character references just for those who do.
const decodeHtmlEntity = (entity: string): string => {
    let decoded = htmlEntityMap.get(entity);
    if (typeof decoded === 'undefined') {
        decoded = (new DOMParser()).parseFromString(entity, 'text/html').body.textContent!;
        htmlEntityMap.set(entity, decoded);
    }
    return decoded;
};

// Sanitize link URLs to ensure that certain XSS-y ones can't be used.
const sanitizeUrl = (url: string): string | null => {
    try {
        const protocol = new URL('https://localhost').protocol;
        // Remove the same types of links as markdown-it does:
        // https://github.com/markdown-it/markdown-it/blob/master/docs/security.md
        if (/^(javascript|data|file):/.test(protocol)) return null;
    } catch {
        return null;
    }

    return url;
};

const renderMarkdown = (
    node: SyntaxNodeRef | string,
    children: ChildNode[] | null,
    doc: string
) => {
    if (typeof node === 'string') return node;

    switch (node.type.name) {
        case 'Document': return <>{children}</>;
        case 'CodeBlock':
        case 'FencedCode': {
            // Remove start/end whitespace outside the CodeText node
            const codeText = children?.find(
                (child): child is SpecialNode & {specialNodeType: SpecialNodeType.CodeText} =>
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    isSpecialNode(child) && child.specialNodeType === SpecialNodeType.CodeText);
            // TODO: language directives, syntax highlight?
            return <pre><code>{codeText?.contents ?? null}</code></pre>;
        }
        case 'Blockquote': return <blockquote>{children}</blockquote>;
        case 'HorizontalRule': return <hr />;
        case 'BulletList': {
            const listItems = children?.map(child => {
                if (isSpecialNode(child) && child.specialNodeType === SpecialNodeType.ListItem) {
                    return child.contents;
                }
                return null;
            });

            // TODO: we handle this by setting <p>s directly inside list items to display: inline; kinda hacky
            const isLoose = children?.some(child => typeof child === 'string' && /\n\n+/.test(child)) ?? false;

            return <ul className={isLoose ? undefined : style.tight}>{listItems}</ul>;
        }
        case 'OrderedList': {
            let startNumber = 1;
            const listItems = children?.map((child, index) => {
                if (isSpecialNode(child) && child.specialNodeType === SpecialNodeType.ListItem) {
                    if (index === 0 && child.mark) startNumber = Number(child.mark.slice(0, -1));
                    return child.contents;
                }
                return null;
            });

            const isLoose = children?.some(child => typeof child === 'string' && /\n\n+/.test(child)) ?? false;

            return <ol className={isLoose ? undefined : style.tight} start={startNumber}>{listItems}</ol>;
        }
        case 'ListItem': {
            const firstListMark = children?.find(
                (child): child is SpecialNode & {specialNodeType: SpecialNodeType.ListMark} =>
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    isSpecialNode(child) && child.specialNodeType === SpecialNodeType.ListMark);
            return {
                specialNodeType: SpecialNodeType.ListItem,
                mark: firstListMark?.contents ?? null,
                contents: <li>{children?.filter(child => !isSpecialNode(child))}</li>
            } as const;
        }
        case 'ATXHeading1':
        case 'SetextHeading1': return <h1>{children}</h1>;
        case 'ATXHeading2':
        case 'SetextHeading2': return <h2>{children}</h2>;
        case 'ATXHeading3': return <h3>{children}</h3>;
        case 'ATXHeading4': return <h4>{children}</h4>;
        case 'ATXHeading5': return <h5>{children}</h5>;
        case 'ATXHeading6': return <h6>{children}</h6>;
        case 'HTMLBlock': return doc.slice(node.from, node.to);
        case 'LinkReference': return null; // TODO: configure visibility
        case 'Paragraph': return <p>{children?.length ? children : doc.slice(node.from, node.to)}</p>;
        case 'CommentBlock': return null; // TODO: configure visibility
        case 'ProcessingInstructionBlock': return doc.slice(node.from, node.to); // TODO: configure visibility

        // Inline
        case 'Escape': return doc.slice(node.from + 1, node.to); // The backslash is included in the node; strip it off
        case 'Entity': return decodeHtmlEntity(doc.slice(node.from, node.to));
        case 'HardBreak': return <br />;
        case 'Emphasis': return <em>{children}</em>;
        case 'StrongEmphasis': return <strong>{children}</strong>;
        case 'Link': {
            let url = children?.find(
                (child): child is SpecialNode & {specialNodeType: SpecialNodeType.URL} =>
                    isSpecialNode(child) && child.specialNodeType === SpecialNodeType.URL)?.contents ?? undefined;
            const linkText = children?.find((child): child is string => typeof child === 'string') ?? null;
            const linkTitle = children?.find(
                (child): child is SpecialNode & {specialNodeType: SpecialNodeType.LinkTitle} =>
                    isSpecialNode(child) && child.specialNodeType === SpecialNodeType.LinkTitle)?.contents ?? undefined;

            if (url) url = sanitizeUrl(url) ?? undefined;

            return <a href={url} title={linkTitle}>{linkText}</a>;
        }
        case 'Image': return doc.slice(node.from, node.to); // TODO: figure out what to do for this
        case 'InlineCode': return <code>{children}</code>;
        case 'HTMLTag': return doc.slice(node.from, node.to);
        case 'Comment': return null; // TODO: configure visibility
        case 'ProcessingInstruction': return doc.slice(node.from, node.to);
        case 'Autolink': {
            const url = children?.find(
                (child): child is SpecialNode & {specialNodeType: SpecialNodeType.URL} =>
                    isSpecialNode(child) && child.specialNodeType === SpecialNodeType.URL)?.contents ?? undefined;

            const sanitized = url ? (sanitizeUrl(url) ?? undefined) : undefined;
            return <a href={sanitized}>{url}</a>;
        }

        // Smaller tokens
        case 'HeaderMark':
        case 'EmphasisMark':
        case 'QuoteMark': return null;
        // Needed to start ordered lists at the correct number
        case 'ListMark': return {
            specialNodeType: SpecialNodeType.ListMark,
            contents: doc.slice(node.from, node.to)
        } as const;
        case 'LinkMark':
        case 'CodeMark': return null;
        case 'CodeText': return {
            specialNodeType: SpecialNodeType.CodeText,
            contents: doc.slice(node.from, node.to)
        } as const;
        case 'CodeInfo': return null;
        case 'LinkTitle': return {
            specialNodeType: SpecialNodeType.LinkTitle,
            contents: doc.slice(node.from + 1, node.to - 1) // Trim quotes / parens
        } as const;
        case 'LinkLabel': return null; // TODO: resolve link references(?)
        case 'URL': return {
            specialNodeType: SpecialNodeType.URL,
            contents: doc.slice(node.from, node.to)
        } as const;
    }

    return <span className={style.unimplementedNode}>{node.type.name} unimplemented</span>;
};

const ChatDisplay = () => {
    const {chat} = useAppState();
    const markdownCache = useMemo(() => new MarkdownCache(), []);
    const chatDisplayElem = useRef<HTMLDivElement>(null);
    const isScrolledToBottom = useRef<boolean>(true);

    const markdownTree = useSignal<{tree: Tree, fragments: readonly TreeFragment[]} | null>(null);
    if (!markdownTree.value) {
        const tree = parser.parse(chat.history.contents.value);
        markdownTree.value = {tree, fragments: TreeFragment.addTree(tree)};
    }

    const doc = useSignal('');

    useLayoutEffect(() => {
        const history = chat.history;
        const listener = ({change}: TextChangeEvent) => {
            //console.log(change);
            let {tree, fragments} = markdownTree.value!;

            fragments = TreeFragment.applyChanges(fragments, [{
                fromA: change.from,
                toA: change.to,
                fromB: change.from,
                toB: change.from + change.inserted.length
            }]);
            tree = parser.parse(history.contents.value, fragments);
            fragments = TreeFragment.addTree(tree, fragments);

            batch(() => {
                markdownTree.value = {tree, fragments};
                doc.value = history.contents.value;
            });
        };

        history.addEventListener('textchange', listener);

        return () => {
            history.removeEventListener('textchange', listener);
        };
    }, []);

    const rendered = useComputed(() => {
        const {tree} = markdownTree.value!;
        return markdownCache.mapMarkdown(tree, doc.value, renderMarkdown);
    });

    // Auto-scroll to include new lines if we're scrolled to the bottom
    useLayoutEffect(() => {
        const chatDisplay = chatDisplayElem.current!;

        const shouldScrollToBottom = isScrolledToBottom.current;
        isScrolledToBottom.current = chatDisplay.scrollHeight - chatDisplay.clientHeight <= chatDisplay.scrollTop;

        if (shouldScrollToBottom) {
            chatDisplay.scrollTo({top: chatDisplay.scrollHeight - chatDisplay.clientHeight + 1});
        }

    }, [rendered.value]);

    const debug = useComputed(() => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!DEBUG) return null;
        const {tree} = markdownTree.value!;
        return <>
            <hr />
            <div>{markdownCache.mapMarkdown(tree, doc.value, renderDebugMarkdown)}</div>
        </>;
    }).value;

    return (
        <div className={style.chatDisplay} ref={chatDisplayElem}>
            <div className={style.markdown}>{rendered}</div>
            {debug}
        </div>
    );
};

export default ChatDisplay;
