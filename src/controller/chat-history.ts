import {signal, Signal} from '@preact/signals';
import {TypedEvent, TypedEventTarget} from '../util/typed-events';
import {EditorSelection} from '@codemirror/state';

export type ChatChange = {
    from: number,
    to: number,
    inserted: string,
    timestamp: number,
    metadata?: ChatChangeMetadataMap
};

interface ChatChangeMetadata {
    merge (newChange: ThisType<this>): ThisType<this>;
    invert (): ThisType<this>;
}

export class CodeMirrorChangeMetadata implements ChatChangeMetadata {
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

export class TextGenerationChangeMetadata implements ChatChangeMetadata {
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

type ChatChangeMetadataMap = {
    codemirror?: CodeMirrorChangeMetadata,
    textgen?: TextGenerationChangeMetadata
};

const mergeMetadata = (oldMetadataMap: ChatChangeMetadataMap, newMetadataMap: ChatChangeMetadataMap) => {
    const merged: ChatChangeMetadataMap = {};

    for (const [key, oldMetadata] of Object.entries(oldMetadataMap)) {
        const newMetadata = newMetadataMap[key as keyof ChatChangeMetadataMap] as typeof oldMetadata;
        // eslint-disable-next-line max-len
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        merged[key as keyof ChatChangeMetadataMap] = oldMetadata.merge(newMetadata as any) as any;
    }

    return merged;
};

type InvertibleChatChange = ChatChange & {
    removed: string
};

export class ChatChangeEvent extends TypedEvent<'chatchange'> {
    change;
    constructor (change: ChatChange) {
        super('chatchange');
        this.change = change;
    }
}

// Merge changes if they occurred within 2 seconds of each other
const MERGE_CHANGE_TIMESTAMP_THRESHOLD = 2000;

export class ChatHistory extends TypedEventTarget<ChatChangeEvent> {
    contents: Signal<string>;
    undoState: Signal<{
        canUndo: boolean,
        canRedo: boolean,
        canRetry: boolean
    }> = signal({canUndo: false, canRedo: false, canRetry: false});

    private changes: InvertibleChatChange[] = [];
    private undoCursor: number = 0;

    constructor (contents = '') {
        super();

        this.contents = signal(contents);
    }

    private tryMergeChanges (
        oldChange: InvertibleChatChange,
        newChange: InvertibleChatChange
    ): InvertibleChatChange | null {
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

            return {
                from: oldChange.from,
                to: mergedTo,
                inserted: oldChange.inserted + newChange.inserted,
                removed: oldChange.removed + newChange.removed,
                // Take the timestamp from the new change so that we don't break things up into n-millisecond "chunks"
                // when merging based on timestamp differences
                timestamp: newChange.timestamp,
                metadata: mergeMetadata(oldChange.metadata, newChange.metadata)
            };
        }

        if (oldChange.from === newChange.to) {
            return {
                from: newChange.from,
                to: oldChange.to,
                inserted: newChange.inserted + oldChange.inserted,
                removed: newChange.removed + oldChange.removed,
                timestamp: newChange.timestamp,
                metadata: mergeMetadata(oldChange.metadata, newChange.metadata)
            };
        }

        return null;
    }

    private canMergeChanges (oldChange: InvertibleChatChange, newChange: InvertibleChatChange) {
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

    private storeChange (change: InvertibleChatChange) {
        if (this.undoCursor > 0) {
            const prevChange = this.changes[this.undoCursor - 1];

            const mergedChange = this.canMergeChanges(prevChange, change) ?
                this.tryMergeChanges(prevChange, change) :
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

    private applyChange (change: ChatChange) {
        const oldContents = this.contents.value;

        this.contents.value = oldContents.slice(0, change.from) +
            change.inserted +
            oldContents.slice(change.to, oldContents.length);
    }

    private unapplyChange (change: InvertibleChatChange): ChatChange {
        const oldContents = this.contents.value;

        const lenDiff = change.inserted.length - change.removed.length;
        this.contents.value = oldContents.slice(0, change.from) +
            change.removed +
            oldContents.slice(change.to + lenDiff, oldContents.length);

        let undoneMetadata: ChatChangeMetadataMap | undefined;
        if (change.metadata) {
            undoneMetadata = {};
            for (const [key, metadata] of Object.entries(change.metadata)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                undoneMetadata[key as keyof ChatChangeMetadataMap] = metadata.invert() as any;
            }
        }

        return {
            from: change.from,
            to: change.to + lenDiff,
            inserted: change.removed,
            timestamp: Date.now(),
            metadata: undoneMetadata
        };
    }

    private updateUndoState () {
        this.undoState.value = {
            canUndo: this.undoCursor > 0,
            canRedo: this.undoCursor < this.changes.length,
            canRetry: this.undoCursor > 0 && !!this.changes[this.undoCursor - 1].metadata?.textgen
        };
    }

    update (change: ChatChange) {
        const oldContents = this.contents.value;

        this.applyChange(change);

        const invertibleChange = {
            from: change.from,
            to: change.to,
            inserted: change.inserted,
            removed: oldContents.slice(change.from, change.to),
            timestamp: change.timestamp,
            metadata: change.metadata
        };

        this.storeChange(invertibleChange);

        this.updateUndoState();
        this.dispatchEvent(new ChatChangeEvent(change));
    }

    undo () {
        if (this.undoCursor === 0) return;
        const unchange = this.unapplyChange(this.changes[this.undoCursor - 1]);
        this.undoCursor--;

        this.updateUndoState();
        this.dispatchEvent(new ChatChangeEvent(unchange));
    }

    redo () {
        if (this.undoCursor === this.changes.length) return;
        const change = this.changes[this.undoCursor];

        this.applyChange(change);

        this.undoCursor++;

        this.updateUndoState();
        this.dispatchEvent(new ChatChangeEvent(change));
    }
}
