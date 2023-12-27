import {createContext} from 'preact';
import {useContext, useMemo} from 'preact/hooks';
import {signal, effect, batch, Signal} from '@preact/signals';
import * as List from 'list';
import {ChatHistory} from './controller/chat-history';

export enum ChatStatus {
    IDLE,
    GENERATING
}

export type ChatState = {
    status: Signal<ChatStatus>,
    history: ChatHistory,
};

/**
 * Global application state
 */
export type AppState = {
    apiUrl: Signal<string>,
    chat: ChatState,
    chatBoxText: Signal<string>,
};

export const AppContext = createContext<AppState | undefined>(undefined);

/**
 * Hook for accessing global application state
 */
export const useAppState = (): AppState => {
    const context = useContext(AppContext);
    if (!context) throw new Error('No AppState provided');
    return context;
};

export const useAction = <T extends unknown[], V>(
    func: (store: AppState, ...args: T) => V): ((...args: T) => V) => {
    const context = useAppState();
    return useMemo(() => func.bind(null, context), [context]);
};

export const createStore = (): AppState => {
    const store = {
        apiUrl: signal(''),
        chatBoxText: signal(''),
        chat: {
            status: signal(ChatStatus.IDLE),
            history: new ChatHistory(),
            tokenStream: signal(List.list<string>())
        }
    };

    const loadedStateString = localStorage.getItem('savedState');
    if (loadedStateString) {
        try {
            const loadedState = JSON.parse(loadedStateString) as Partial<{
                apiUrl: string
            }>;

            batch(() => {
                if (loadedState.apiUrl) store.apiUrl.value = loadedState.apiUrl;
            });
        } catch (err) {
            // TODO: proper on-screen error reporting
            // eslint-disable-next-line no-console
            console.warn('Cannot load previous app state.', err);
        }
    }

    // Persist some settings across reloads
    effect(() => {
        const savedState = {
            version: 1,
            apiUrl: store.apiUrl.value
        };

        localStorage.setItem('savedState', JSON.stringify(savedState));
    });

    return store;
};
