import {createContext} from 'preact';
import {useContext, useMemo} from 'preact/hooks';
import {signal, effect, batch, Signal} from '@preact/signals';
import {TextHistory} from './controller/text-history';
import type {AIBackend, Jsonable} from './backends/ai-backend';
import KoboldCppBackend from './backends/koboldcpp';

export enum ChatStatus {
    IDLE,
    GENERATING
}

export type ChatState = {
    status: Signal<ChatStatus>,
    generationProgress: Signal<number>,
    history: TextHistory,
};

/**
 * Global application state
 */
export type AppState = {
    chat: ChatState,
    chatBoxText: Signal<string>,
    backend: Signal<AIBackend>,
    allBackendSettings: Signal<Partial<Record<string, Jsonable>>>
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
    const store: AppState = {
        chatBoxText: signal(''),
        chat: {
            status: signal(ChatStatus.IDLE),
            generationProgress: signal(0),
            history: new TextHistory()
        },
        backend: signal(new KoboldCppBackend()),
        allBackendSettings: signal({})
    };

    const loadedStateString = localStorage.getItem('savedState');
    if (loadedStateString) {
        try {
            const loadedState = JSON.parse(loadedStateString) as Partial<{
                apiUrl: string,
                backendSettings: Partial<Record<string, Jsonable>>
            }>;

            batch(() => {
                if (loadedState.backendSettings) store.allBackendSettings.value = loadedState.backendSettings;

                const currentBackendID = store.backend.value.id;
                if (loadedState.backendSettings?.[currentBackendID]) {
                    store.backend.value.loadSettings(loadedState.backendSettings[currentBackendID]);
                }
            });
        } catch (err) {
            // TODO: proper on-screen error reporting
            // eslint-disable-next-line no-console
            console.warn('Cannot load previous app state.', err);
        }
    }

    // Load backend settings on backend change
    effect(() => {
        const currentBackend = store.backend.value;
        const allBackendSettings = store.allBackendSettings.peek();
        if (Object.prototype.hasOwnProperty.call(allBackendSettings, currentBackend.id)) {
            currentBackend.loadSettings(allBackendSettings[currentBackend.id]);
        }
    });

    // Whenever a backend's settings change, save them in allBackendSettings
    // TODO: this causes us to load after every save. Find some way to avoid that
    effect(() => {
        batch(() => {
            const currentBackend = store.backend.value;
            store.allBackendSettings.value = {
                ...store.allBackendSettings.peek(),
                [currentBackend.id]: currentBackend.saveSettings()
            };
        });
    });

    // Persist some settings across reloads
    effect(() => {
        const savedState = {
            version: 1,
            backendSettings: store.allBackendSettings.value
        };

        localStorage.setItem('savedState', JSON.stringify(savedState));
    });

    return store;
};
