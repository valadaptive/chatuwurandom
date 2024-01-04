import {signal, Signal} from '@preact/signals';
import {EditorSelection} from '@codemirror/state';

import {TypedEvent, TypedEventTarget} from '../util/typed-events';
import {generateID} from '../util/id';
import type {Change} from './change';

export type TextChangeDescriptor = {
    from: number,
    to: number,
    inserted: string,
    timestamp: number,
    metadata?: TextChangeMetadataMap
};

class TextChange implements Change {
    readonly id;
    readonly inverseOf;
    readonly from;
    readonly to;
    readonly inserted;
    readonly removed;
    readonly timestamp;
    readonly metadata;

    constructor ({from, to, inserted, removed, timestamp, metadata, inverseOf}:
    TextChangeDescriptor & {removed: string, inverseOf?: string}) {
        this.id = generateID();
        this.from = from;
        this.to = to;
        this.inserted = inserted;
        this.removed = removed;
        this.timestamp = timestamp;
        this.metadata = metadata;
        this.inverseOf = inverseOf;
    }

    invert (): TextChange {
        let undoneMetadata: TextChangeMetadataMap | undefined;
        if (this.metadata) {
            undoneMetadata = {};
            for (const [key, metadata] of Object.entries(this.metadata)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                undoneMetadata[key as keyof TextChangeMetadataMap] = metadata.invert() as any;
            }
        }

        const lenDiff = this.inserted.length - this.removed.length;
        return new TextChange({
            from: this.from,
            to: this.to + lenDiff,
            inserted: this.removed,
            removed: this.inserted,
            timestamp: Date.now(),
            metadata: undoneMetadata
        });
    }

    static merge (oldChange: TextChange, newChange: TextChange): TextChange | null {
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

            return new TextChange({
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
            return new TextChange({
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
}

interface TextChangeMetadata {
    merge (newChange: ThisType<this>): ThisType<this>;
    invert (): ThisType<this>;
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
}

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
    constructor (change: TextChange) {
        super('textchange');
        this.change = change;
    }
}

// Merge changes if they occurred within 2 seconds of each other
const MERGE_CHANGE_TIMESTAMP_THRESHOLD = 2000;

export class TextHistory extends TypedEventTarget<TextChangeEvent> {
    contents: Signal<string>;
    undoState: Signal<{
        canUndo: boolean,
        canRedo: boolean,
        canRetry: boolean
    }> = signal({canUndo: false, canRedo: false, canRetry: false});

    private changes: TextChange[] = [];
    private undoCursor: number = 0;

    constructor (contents = '') {
        super();

        this.contents = signal(contents);
    }

    private canMergeChanges (oldChange: TextChange, newChange: TextChange) {
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

    private storeChange (change: TextChange) {
        if (this.undoCursor > 0) {
            const prevChange = this.changes[this.undoCursor - 1];

            const mergedChange = this.canMergeChanges(prevChange, change) ?
                TextChange.merge(prevChange, change) :
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
        } else {
            this.changes.push(change);
            this.undoCursor++;
        }
    }

    private applyChange (change: TextChange) {
        const oldContents = this.contents.value;

        this.contents.value = oldContents.slice(0, change.from) +
            change.inserted +
            oldContents.slice(change.to, oldContents.length);
    }

    private unapplyChange (change: TextChange): TextChange {
        const inverted = change.invert();
        this.applyChange(inverted);

        return inverted;
    }

    private updateUndoState () {
        this.undoState.value = {
            canUndo: this.undoCursor > 0,
            canRedo: this.undoCursor < this.changes.length,
            canRetry: this.undoCursor > 0 && !!this.changes[this.undoCursor - 1].metadata?.textgen
        };
    }

    update (change: TextChangeDescriptor) {
        const oldContents = this.contents.value;

        const textChange = new TextChange({
            from: change.from,
            to: change.to,
            inserted: change.inserted,
            removed: oldContents.slice(change.from, change.to),
            timestamp: change.timestamp,
            metadata: change.metadata
        });

        this.applyChange(textChange);
        this.storeChange(textChange);

        this.updateUndoState();
        this.dispatchEvent(new TextChangeEvent(textChange));
    }

    undo () {
        if (this.undoCursor === 0) return;
        const unchange = this.unapplyChange(this.changes[this.undoCursor - 1]);
        this.undoCursor--;

        this.updateUndoState();
        this.dispatchEvent(new TextChangeEvent(unchange));
    }

    redo () {
        if (this.undoCursor === this.changes.length) return;
        const change = this.changes[this.undoCursor];

        this.applyChange(change);

        this.undoCursor++;

        this.updateUndoState();
        this.dispatchEvent(new TextChangeEvent(change));
    }
}
