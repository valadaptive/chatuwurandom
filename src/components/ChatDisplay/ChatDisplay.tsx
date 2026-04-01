import style from './style.module.scss';

import type {JSX} from 'preact';
import {useLayoutEffect, useMemo, useRef} from 'preact/hooks';
import {type SyntaxNodeRef} from '@lezer/common';

import {useAppState, ChatStatus, type StreamState} from '../../app-state';
import {useController} from '../../controller/context';
import {parser} from '../../text-processing/markdown';
import {SyntaxNodeCache} from '../../util/syntax-node-cache';
import type {Message, Attachment} from '../../controller/message';

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
const decodeHtmlEntity = (entity: string): string => {
    let decoded = htmlEntityMap.get(entity);
    if (typeof decoded === 'undefined') {
        decoded = (new DOMParser()).parseFromString(entity, 'text/html').body.textContent!;
        htmlEntityMap.set(entity, decoded);
    }
    return decoded;
};

const sanitizeUrl = (url: string): string | null => {
    try {
        const protocol = new URL(url, 'https://localhost').protocol;
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
            const codeText = children?.find(
                (child): child is SpecialNode & {specialNodeType: SpecialNodeType.CodeText} =>
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    isSpecialNode(child) && child.specialNodeType === SpecialNodeType.CodeText);
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
        case 'LinkReference': return null;
        case 'Paragraph': return <p>{children?.length ? children : doc.slice(node.from, node.to)}</p>;
        case 'CommentBlock': return null;
        case 'ProcessingInstructionBlock': return doc.slice(node.from, node.to);

        // Inline
        case 'Escape': return doc.slice(node.from + 1, node.to);
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
        case 'Image': return doc.slice(node.from, node.to);
        case 'InlineCode': return <code>{children}</code>;
        case 'HTMLTag': return doc.slice(node.from, node.to);
        case 'Comment': return null;
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
            contents: doc.slice(node.from + 1, node.to - 1)
        } as const;
        case 'LinkLabel': return null;
        case 'URL': return {
            specialNodeType: SpecialNodeType.URL,
            contents: doc.slice(node.from, node.to)
        } as const;
    }

    return <span className={style.unimplementedNode}>{node.type.name} unimplemented</span>;
};

const MessageHeader = ({role}: {role: 'user' | 'assistant'}) => (
    <div className={style.messageHeader}>
        <div className={`${style.avatar} ${role === 'user' ? style.userAvatar : style.assistantAvatar}`}>
            {role === 'user' ? 'U' : ':3'}
        </div>
        <div className={style.roleName}>{role === 'user' ? 'You' : 'uwurandom'}</div>
    </div>
);

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentChips = ({attachments}: {attachments: Attachment[]}) => (
    <div className={style.attachmentList}>
        {attachments.map((file, i) => (
            <div key={i} className={style.attachmentChip}>
                <span className={style.attachmentName}>{file.name}</span>
                <span className={style.attachmentSize}>{formatSize(file.size)}</span>
            </div>
        ))}
    </div>
);

/** Renders a completed message with one-shot parsing. */
const CompletedMessage = ({message}: {message: Message}) => {
    const markdownCache = useMemo(() => new SyntaxNodeCache(), []);

    const rendered = useMemo(() => {
        if (message.content.length === 0) return null;
        const tree = parser.parse(message.content);
        return markdownCache.mapNodes(tree, message.content, renderMarkdown);
    }, [message.content]);

    return (
        <div className={style.message}>
            <MessageHeader role={message.role} />
            {message.attachments && <AttachmentChips attachments={message.attachments} />}
            <div className={style.markdown}>{rendered}</div>
        </div>
    );
};

const CAT_ACTIONS = [
    'Chasing a laser pointer',
    'Knocking things off the table',
    'Batting around a little ball of yarn',
    'Staring at nothing',
    'Zooming around',
    'Sitting on the keyboard',
    'Ignoring you on purpose',
    'Investigating a cardboard box',
    'Kneading a blanket',
    'Loafing',
    'Stealing your chair',
    'Meowing at a closed door',
    'Sitting in a doorway',
    'Knocking over a glass of water',
    'Demanding treats'
];

const pickCatAction = () => CAT_ACTIONS[Math.floor(Math.random() * CAT_ACTIONS.length)];

const ThinkingMessage = () => {
    const action = useMemo(pickCatAction, []);

    return (
        <div className={style.message}>
            <MessageHeader role="assistant" />
            <div className={style.thinking}>
                <span className={style.thinkingText}>{action}</span>
                <span className={style.loader}>
                    <span className={style.dot} /><span className={style.dot} /><span className={style.dot} />
                </span>
            </div>
        </div>
    );
};

/** Renders the currently-streaming assistant message with incremental parsing. */
const StreamingMessage = ({streamState}: {streamState: StreamState}) => {
    const markdownCache = useMemo(() => new SyntaxNodeCache(), []);

    const rendered = useMemo(() => {
        const {tree, content} = streamState;
        if (content.length === 0) return null;
        return markdownCache.mapNodes(tree, content, renderMarkdown);
    }, [streamState]);

    return (
        <div className={style.message}>
            <MessageHeader role="assistant" />
            <div className={style.markdown}>{rendered}<span className={style.cursor} /></div>
        </div>
    );
};

const SUGGESTIONS = [
    'Tell me about quantum physics',
    'Write me a poem about fish',
    'Explain the meaning of life',
    'What\'s your favorite food?'
];

const WelcomeScreen = () => {
    const controller = useController();

    return (
        <div className={style.welcome}>
            <div className={style.welcomeAvatar}>:3</div>
            <h1 className={style.welcomeTitle}>uwurandom</h1>
            <p className={style.welcomeSubtitle}>How can I help you today?</p>
            <div className={style.suggestions}>
                {SUGGESTIONS.map(text => (
                    <button
                        key={text}
                        className={style.suggestion}
                        onClick={() => void controller.sendMessage(text)}
                    >{text}</button>
                ))}
            </div>
        </div>
    );
};

const ChatDisplay = () => {
    const {chat} = useAppState();
    const chatDisplayElem = useRef<HTMLDivElement>(null);
    const anchorElem = useRef<HTMLDivElement>(null);
    const pinnedToBottom = useRef<boolean>(true);

    const messages = chat.messages.value;
    const streamState = chat.streamState.value;
    const status = chat.status.value;
    const isEmpty = messages.length === 0 && status === ChatStatus.IDLE;

    // Detect when user scrolls away from the bottom
    const onScroll = () => {
        const el = chatDisplayElem.current!;
        pinnedToBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 30;
    };

    // Scroll to bottom when pinned and content changes
    useLayoutEffect(() => {
        if (pinnedToBottom.current) {
            anchorElem.current!.scrollIntoView({block: 'end'});
        }
    });

    // Pin to bottom when thinking/generating starts
    useLayoutEffect(() => {
        if (status !== ChatStatus.IDLE) {
            pinnedToBottom.current = true;
        }
    }, [status]);

    return (
        <div className={style.chatDisplay} ref={chatDisplayElem} onScroll={onScroll}>
            {isEmpty && <WelcomeScreen />}
            {messages.map(message => (
                <CompletedMessage key={message.id} message={message} />
            ))}
            {status === ChatStatus.THINKING && <ThinkingMessage />}
            {streamState && <StreamingMessage streamState={streamState} />}
            <div className={style.scrollAnchor} ref={anchorElem} />
        </div>
    );
};

export default ChatDisplay;
