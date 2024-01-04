import {Signal} from '@preact/signals';

type SourceFor<T> = T extends Signal<infer U> ?
    SourceFor<U> :
    T extends SignalizedConfig ? {[P in keyof T]?: SourceFor<T[P]>} : T;


type Primitive = string | number | boolean | null | Primitive[] | SignalizedConfig;

type SignalizedConfig = {
    [x: string]: Primitive | Signal<Primitive>
};

/**
 * Merge a partial "plain object" (parsed from JSON) into a settings object which may contain fields that are signals.
 * Arrays will be reassigned, but objects will be merged into.
 * @param dst The destination settings to merge into.
 * @param src The (partial) source settings to merge from.
 */
export const mergeInto = <T extends SignalizedConfig>(dst: T, src: SourceFor<T>): void => {
    for (const key of Object.keys(dst)) {
        if (!Object.prototype.hasOwnProperty.call(src, key as keyof typeof src)) continue;

        const k = key as (keyof typeof src) & (keyof typeof dst);

        const srcEntry = src[k];
        if (typeof srcEntry === 'undefined') continue;

        const dstEntry = dst[k];

        if (dstEntry instanceof Signal) {
            const dstValue = dstEntry.peek();
            const isObject = typeof dstValue === 'object' && dstValue !== null && !Array.isArray(dstValue);
            if (isObject) {
                mergeInto(dstValue, srcEntry as SourceFor<typeof dstValue>);
            } else {
                dstEntry.value = srcEntry as Primitive;
            }
        } else {
            const isObject = typeof dstEntry === 'object' && dstEntry !== null && !Array.isArray(dstEntry);
            if (isObject) {
                mergeInto(dstEntry, srcEntry as SourceFor<typeof dstEntry> & object);
            } else {
                dst[k] = srcEntry as typeof dst[typeof k];
            }
        }
    }
};
