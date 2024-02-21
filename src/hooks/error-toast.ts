import {useAddToast} from '../components/Toast/Toast';
import {Motif} from '../util/motif';

export const useErrorToast = () => {
    const addToast = useAddToast();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <T extends any[], U>(fn: (...args: T) => U, title?: string): (...args: T) => U | undefined => {
        return (...args) => {
            try {
                return fn(...args);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                addToast({contents: message, title, motif: Motif.ERROR});
            }
        };
    };
};

export const useErrorToastAsync = () => {
    const addToast = useAddToast();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <T extends any[], U>(
        fn: (...args: T) => Promise<U>,
        title?: string
    ): (...args: T) => Promise<U | undefined> => {
        return (...args) =>
            fn(...args).catch(err => {
                const message = err instanceof Error ? err.message : String(err);
                addToast({contents: message, title, motif: Motif.ERROR});
                return undefined;
            });
    };
};
