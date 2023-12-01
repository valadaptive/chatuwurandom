import {createContext} from 'preact';
import {useContext, useMemo} from 'preact/hooks';
import {signal, effect, Signal} from '@preact/signals';

/**
 * Global application state
 */
export type AppState = {
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
    return {};
};
