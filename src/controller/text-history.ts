import {signal, Signal} from '@preact/signals';
import {EditorSelection} from '@codemirror/state';
import type {Jsonable} from '../util/jsonable';

import {TypedEvent, TypedEventTarget} from '../util/typed-events';
import {generateID} from '../util/id';
import {jsonMatchesSchema, Schema, SchemaToObject} from '../util/validate-json';
import ChangeStream, {LogChangeEvent, RedoEvent, UndoEvent} from './change-stream';

/** Describes a change to the textual content of a document. */
export type TextChange = {
    /** Unique ID for this change. Will be generated if not provided. */
    id?: string,
    /** The start index of the text span to be removed from the document. */
    from: number,
    /** The (exclusive) end index of the text span to be removed from the document. Works like String.slice. */
    to: number,
    /** The new text to be inserted into the document at {@link TextChange.from}. */
    inserted: string,
    /** The time at which the change takes place. */
    timestamp: number,
    /** Extra metadata related to whichever entity performed the change. */
    metadata?: TextChangeMetadataMap
};

type TextChangeInit = TextChange & {removed: string, inverseOf?: string, id?: string};

const textChangeSchema = {
    type: 'object',
    properties: {
        id: 'string',
        inverseOf: ['string', 'undefined'],
        from: 'number',
        to: 'number',
        inserted: 'string',
        timestamp: 'number',
        metadata: [{type: 'object', properties: {}, partial: true}, 'undefined']
    }
} as const satisfies Schema;

const deserializeTextChange = (json: unknown): TextChange => {
    if (!jsonMatchesSchema(textChangeSchema, json)) {
        throw new Error('Invalid JSON');
    }

    const change: TextChange = {
        id: json.id,
        from: json.from,
        to: json.to,
        inserted: json.inserted,
        timestamp: json.timestamp
    };

    const {metadata} = json;
    if (typeof metadata !== 'undefined') {
        const hydratedMetadata: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(metadata)) {
            const deserializer = (metadataDeserializers as Partial<typeof metadataDeserializers>)[
                key as keyof typeof metadataDeserializers];
            if (!deserializer) throw new Error(`Unknown metadata type "${key}"`);


            hydratedMetadata[key] = deserializer(value as Jsonable);
        }
        change.metadata = hydratedMetadata as TextChangeMetadataMap;
    }

    return change;
};

class InvertibleTextChange {
    readonly id;
    readonly inverseOf;
    readonly from;
    readonly to;
    readonly inserted;
    readonly removed;
    readonly timestamp;
    readonly metadata;

    constructor ({id, from, to, inserted, removed, timestamp, metadata, inverseOf}: TextChangeInit) {
        this.id = id ?? generateID();
        this.from = from;
        this.to = to;
        this.inserted = inserted;
        this.removed = removed;
        this.timestamp = timestamp;
        this.metadata = metadata;
        this.inverseOf = inverseOf;
    }

    invert (): InvertibleTextChange {
        let undoneMetadata: TextChangeMetadataMap | undefined;
        if (this.metadata) {
            undoneMetadata = {};
            for (const [key, metadata] of Object.entries(this.metadata)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                undoneMetadata[key as keyof TextChangeMetadataMap] = metadata.invert() as any;
            }
        }

        const lenDiff = this.inserted.length - this.removed.length;
        return new InvertibleTextChange({
            from: this.from,
            to: this.to + lenDiff,
            inserted: this.removed,
            removed: this.inserted,
            timestamp: Date.now(),
            metadata: undoneMetadata
        });
    }

    static merge (oldChange: InvertibleTextChange, newChange: InvertibleTextChange): InvertibleTextChange | null {
        // Can't merge if the metadata differs
        if (!oldChange.metadata || !newChange.metadata) return null;
        const oldMetadataKeys = Object.keys(oldChange.metadata);
        const newMetadataKeys = Object.keys(newChange.metadata);
        if (
            oldMetadataKeys.length !== newMetadataKeys.length ||
            oldMetadataKeys.some(key => !newMetadataKeys.includes(key))
        ) {
            return null;
        }

        const newFrom = oldChange.from + oldChange.inserted.length;
        if (newFrom === newChange.from) {
            const mergedTo = newChange.to - oldChange.inserted.length + (oldChange.to - oldChange.from);

            return new InvertibleTextChange({
                from: oldChange.from,
                to: mergedTo,
                inserted: oldChange.inserted + newChange.inserted,
                removed: oldChange.removed + newChange.removed,
                // Take the timestamp from the new change so that we don't break things up into n-millisecond "chunks"
                // when merging based on timestamp differences
                timestamp: newChange.timestamp,
                metadata: mergeMetadata(oldChange.metadata, newChange.metadata)
            });
        }

        if (oldChange.from === newChange.to) {
            return new InvertibleTextChange({
                from: newChange.from,
                to: oldChange.to,
                inserted: newChange.inserted + oldChange.inserted,
                removed: newChange.removed + oldChange.removed,
                timestamp: newChange.timestamp,
                metadata: mergeMetadata(oldChange.metadata, newChange.metadata)
            });
        }

        return null;
    }

    toDescriptor (): SchemaToObject<typeof textChangeSchema> {
        let metadata;
        if (this.metadata) {
            const metadataJson: Record<string, unknown> = {};
            for (const [key, metadata] of Object.entries(this.metadata)) {
                metadataJson[key] = metadata.toJSON();
            }
            metadata = metadataJson;
        }

        return {
            id: this.id,
            inverseOf: this.inverseOf,
            from: this.from,
            to: this.to,
            inserted: this.inserted,
            timestamp: this.timestamp,
            metadata
        };
    }
}

interface TextChangeMetadata {
    merge (newChange: ThisType<this>): ThisType<this>;
    invert (): ThisType<this>;
    toJSON (): Jsonable;
}

export class CodeMirrorChangeMetadata implements TextChangeMetadata {
    oldSelection;
    newSelection;

    constructor (oldSelection: EditorSelection, newSelection: EditorSelection) {
        this.oldSelection = oldSelection;
        this.newSelection = newSelection;
    }

    merge (newChange: CodeMirrorChangeMetadata) {
        return new CodeMirrorChangeMetadata(this.oldSelection, newChange.newSelection);
    }

    invert () {
        return new CodeMirrorChangeMetadata(this.newSelection, this.oldSelection);
    }

    toJSON () {
        return {
            oldSelection: this.oldSelection.toJSON() as Jsonable,
            newSelection: this.newSelection.toJSON() as Jsonable
        };
    }

    static fromJSON (json: Jsonable): CodeMirrorChangeMetadata {
        if (Array.isArray(json) || typeof json !== 'object' || !json) {
            throw new Error('Must be an object');
        }

        return new CodeMirrorChangeMetadata(
            EditorSelection.fromJSON(json.oldSelection),
            EditorSelection.fromJSON(json.newSelection)
        );
    }
}

export class TextGenerationChangeMetadata implements TextChangeMetadata {
    generationId;

    constructor (generationId: string) {
        this.generationId = generationId;
    }

    merge (newChange: TextGenerationChangeMetadata) {
        if (newChange.generationId !== this.generationId) {
            throw new Error('Tried to merge textgen events with two different generation IDs');
        }
        return this;
    }

    invert () {
        return this;
    }

    toJSON () {
        return {generationId: this.generationId};
    }

    static fromJSON (json: Jsonable): TextGenerationChangeMetadata {
        if (Array.isArray(json) || typeof json !== 'object' || !json) {
            throw new Error('Must be an object');
        }
        if (typeof json.generationId !== 'string') throw new Error('`generationId` must be a string');
        return new TextGenerationChangeMetadata(json.generationId);
    }
}

export const metadataDeserializers = {
    codemirror: CodeMirrorChangeMetadata.fromJSON,
    textgen: TextGenerationChangeMetadata.fromJSON
};

type TextChangeMetadataMap = {
    codemirror?: CodeMirrorChangeMetadata,
    textgen?: TextGenerationChangeMetadata
};

const mergeMetadata = (oldMetadataMap: TextChangeMetadataMap, newMetadataMap: TextChangeMetadataMap) => {
    const merged: TextChangeMetadataMap = {};

    for (const [key, oldMetadata] of Object.entries(oldMetadataMap)) {
        const newMetadata = newMetadataMap[key as keyof TextChangeMetadataMap] as typeof oldMetadata;
        // eslint-disable-next-line max-len
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        merged[key as keyof TextChangeMetadataMap] = oldMetadata.merge(newMetadata as any) as any;
    }

    return merged;
};

export class TextChangeEvent extends TypedEvent<'textchange'> {
    change;
    constructor (change: InvertibleTextChange) {
        super('textchange');
        this.change = change;
    }
}

// Merge changes if they occurred within 2 seconds of each other
const MERGE_CHANGE_TIMESTAMP_THRESHOLD = 2000;

export class TextHistory extends TypedEventTarget<
TextChangeEvent |
UndoEvent |
RedoEvent |
LogChangeEvent
> implements ChangeStream {
    /** The static identifier for this event target type, used to properly dispatch events when deserializing. */
    id = 'text_history' as const;

    /** The textual contents of the current document. */
    contents: Signal<string>;

    /** Whether the user can perform an undo, redo, or retry action in the current undo stack position. */
    undoState: Signal<{
        canUndo: boolean,
        canRedo: boolean,
        canRetry: boolean
    }> = signal({canUndo: false, canRedo: false, canRetry: false});

    /** Undo stack / log of every change made to the document. */
    private changes: InvertibleTextChange[] = [];
    /** Where we are in the "undo stack" / log. Decremented when undoing, incremented when redoing. */
    private undoCursor: number = 0;

    constructor (contents = '') {
        super();

        this.contents = signal(contents);
    }

    /**
     * Check whether a change should be merged on top of another.
     * @param oldChange The change to be merged onto.
     * @param newChange The change which we want to merge with oldChange.
     * @returns True if the changes can be merged, false if they cannot.
     */
    private canMergeChanges (oldChange: InvertibleTextChange, newChange: InvertibleTextChange) {
        // Always merge changes from the same textgen, no matter how long they take to stream
        if (
            oldChange.metadata?.textgen &&
            newChange.metadata?.textgen &&
            oldChange.metadata.textgen.generationId === newChange.metadata.textgen.generationId
        ) {
            return true;
        }
        return newChange.timestamp - oldChange.timestamp <= MERGE_CHANGE_TIMESTAMP_THRESHOLD;
    }

    /**
     * Store the given change in the undo stack. Truncates the redo history, if any. Will merge this change with the
     * previous one in the undo history, if eligible.
     * @param change The change to save in the undo stack.
     * @returns True if the change was merged with the previous one, false if it was not.
     */
    private storeChange (change: InvertibleTextChange): boolean {
        if (this.undoCursor > 0) {
            const prevChange = this.changes[this.undoCursor - 1];

            const mergedChange = this.canMergeChanges(prevChange, change) ?
                InvertibleTextChange.merge(prevChange, change) :
                null;

            if (mergedChange) {
                this.changes.length = this.undoCursor - 1;
                // Replace last change rather than adding on
                this.changes[this.undoCursor - 1] = mergedChange;
            } else {
                // Truncate redo history after adding a new change
                this.changes.length = this.undoCursor;
                this.changes[this.undoCursor] = change;
                this.undoCursor++;
            }
            return !!mergedChange;
        } else {
            this.changes.push(change);
            this.undoCursor++;
            return false;
        }
    }

    /**
     * Updates the history's textual state from the given change.
     * @param change The change to apply to the textual state.
     */
    private applyChange (change: InvertibleTextChange) {
        const oldContents = this.contents.value;

        this.contents.value = oldContents.slice(0, change.from) +
            change.inserted +
            oldContents.slice(change.to, oldContents.length);
    }

    /**
     * Update the history's textual state to undo the given change. Does not update the undo cursor.
     * @param change The change to undo.
     * @returns The "inverted" version of the change, which external views can use to synchronize.
     */
    private unapplyChange (change: InvertibleTextChange): InvertibleTextChange {
        const inverted = change.invert();
        this.applyChange(inverted);

        return inverted;
    }

    /**
     * Update the "can undo", "can redo", and "can retry last generation" signals following a history update or an undo
     * / redo action.
     */
    private updateUndoState () {
        this.undoState.value = {
            canUndo: this.undoCursor > 0,
            canRedo: this.undoCursor < this.changes.length,
            canRetry: this.undoCursor > 0 && !!this.changes[this.undoCursor - 1].metadata?.textgen
        };
    }

    /**
     * Apply a change to this history's state. Replaces everything past the current undo state.
     * Emits a TextChangeEvent (to be consumed by views/application state) and a LogChangeEvent (to be serialized).
     * @param change The {@link TextChange} to apply to the history's state.
     */
    update (change: TextChange) {
        const oldContents = this.contents.value;

        const textChange = new InvertibleTextChange({
            id: change.id,
            from: change.from,
            to: change.to,
            inserted: change.inserted,
            removed: oldContents.slice(change.from, change.to),
            timestamp: change.timestamp,
            metadata: change.metadata
        });

        this.applyChange(textChange);
        const merged = this.storeChange(textChange);
        let getMergedChange: null | (() => SchemaToObject<typeof textChangeSchema>) = null;
        if (merged) {
            const mergedChange = this.changes[this.undoCursor - 1];
            getMergedChange = () => mergedChange.toDescriptor();
        }

        this.updateUndoState();
        this.dispatchEvent(new TextChangeEvent(textChange));
        this.dispatchEvent(new LogChangeEvent(
            textChange.id,
            this.id,
            getMergedChange,
            () => textChange.toDescriptor())
        );
    }

    /**
     * Move one step backwards in the undo history, if able. Emits an UndoEvent.
     */
    undo () {
        if (this.undoCursor === 0) return;
        const changeToUndo = this.changes[this.undoCursor - 1];
        const unchange = this.unapplyChange(changeToUndo);
        this.undoCursor--;

        this.updateUndoState();
        this.dispatchEvent(new TextChangeEvent(unchange));
        this.dispatchEvent(new UndoEvent(changeToUndo.id));
    }

    /**
     * Move one step forward in the undo history, if able. Emits a RedoEvent.
     */
    redo () {
        if (this.undoCursor === this.changes.length) return;
        const change = this.changes[this.undoCursor];

        this.applyChange(change);

        this.undoCursor++;

        this.updateUndoState();
        this.dispatchEvent(new TextChangeEvent(change));
        this.dispatchEvent(new RedoEvent(change.id));
    }

    /**
     * Apply a serialized change to this history's state.
     * @param change The serialized change to parse and apply.
     */
    load (change: Jsonable): void {
        this.update(deserializeTextChange(change));
    }

    /**
     * Emit all serialization-related events up to the current state.
     */
    replay () {
        for (const change of this.changes) {
            this.dispatchEvent(new LogChangeEvent(change.id, this.id, null, () => change.toDescriptor()));
        }
        for (let i = this.changes.length; i > this.undoCursor; i--) {
            this.dispatchEvent(new UndoEvent(this.id));
        }
    }
}
