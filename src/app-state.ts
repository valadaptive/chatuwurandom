import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {signal, Signal} from '@preact/signals';
import {Tree, TreeFragment} from '@lezer/common';

import type {Message} from './controller/message';

export enum ChatStatus {
    IDLE,
    THINKING,
    GENERATING
}

export type StreamState = {
    content: string;
    tree: Tree;
    fragments: readonly TreeFragment[];
};

export type ChatState = {
    status: Signal<ChatStatus>;
    messages: Signal<Message[]>;
    streamState: Signal<StreamState | null>;
};

export type AppState = {
    chat: ChatState;
    chatBoxText: Signal<string>;
};

export const AppContext = createContext<AppState | undefined>(undefined);

export const useAppState = (): AppState => {
    const context = useContext(AppContext);
    if (!context) throw new Error('No AppState provided');
    return context;
};

export const createStore = (): AppState => {
    return {
        chat: {
            status: signal(ChatStatus.IDLE),
            messages: signal([]),
            streamState: signal(null)
        },
        chatBoxText: signal('')
    };
};
