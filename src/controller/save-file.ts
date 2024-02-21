import throttle from '../util/throttle';
import {Jsonable} from '../util/jsonable';
import {Schema, SchemaToObject, jsonMatchesSchema} from '../util/validate-json';

import {LogChangeEvent, RedoEvent, UndoEvent} from './change-stream';
import {TextHistory} from './text-history';

import type {Message, MsgResponse} from '../worker/file-writer-worker';

const lineSchema = [
    {
        type: 'object',
        properties: {
            type: {type: 'string', validValues: ['change']},
            id: 'string',
            for: 'string',
            change: {type: 'object', properties: {}}
        }
    },
    {
        type: 'object',
        properties: {
            type: {type: 'string', validValues: ['undo', 'redo']},
            for: 'string'
        }
    }
] as const satisfies Schema;

type EncodedLine = SchemaToObject<typeof lineSchema>;

const ENCODER = new TextEncoder();

/** TypeScript trick to let {@link FileWriterWorker.post} take a message without `id`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DistributiveOmit<T, K extends keyof any> = T extends any
    ? Omit<T, K>
    : never;

/**
 * Helper class to handle communication with the worker that actually does file write operations. Needed because
 * manually flushing the file to disk is important, and the only API that can do that is worker-only.
 */
class FileWriterWorker {
    private readonly worker = new Worker(new URL('../worker/file-writer-worker', import.meta.url));
    private nextId = 0;
    private setupPromise;
    private closed = false;

    constructor (handle: FileSystemFileHandle) {
        this.setupPromise = this.post({type: 'setup', handle});
    }

    /**
     * Write a chunk of data to the file, flushing it to disk.
     * @param data The data to write.
     * @param offset The byte offset at which it should be written into the file.
     * @param truncateTo Optionally, truncate the file to this size after writing the data.
     * @returns A promise that resolves when the operation is complete.
     */
    async write (data: Uint8Array, offset: number, truncateTo?: number) {
        await this.setupPromise;
        return this.post({type: 'write', data, offset, truncateTo});
    }

    /**
     * Close the file, releasing its lock and flushing any remaining data.
     */
    close () {
        if (this.closed) return;
        this.closed = true;
        return this.post({type: 'close'});
    }

    /**
     * Helper method for IPC which wraps the event-based worker API into a promise-based API.
     * @param message The message to be sent to the worker.
     * @returns A promise which resolves (or rejects) with the worker's response to that message.
     */
    private post (message: DistributiveOmit<Message, 'id'>) {
        const id = this.nextId++;
        const msg = message;

        return new Promise<void>((resolve, reject) => {
            this.worker.postMessage({...message, id});
            const waitForResponse = (message: MessageEvent) => {
                const data = message.data as MsgResponse;
                if (data.id !== id) return;

                this.worker.removeEventListener('message', waitForResponse);
                if (data.type === 'success') {
                    resolve();
                } else {
                    reject(new Error(data.err.message + JSON.stringify(msg)));
                }
            };
            this.worker.addEventListener('message', waitForResponse);
        });
    }
}

/**
 * A log-structured save file. Changes are saved as they come in by appending to the file. Loading is performed by
 * replaying all of the changes. This makes saving extremely fast (auto-save is effectively free) and preserves the
 * entire undo history across saves/loads, but loading is likely slower and the save files will be larger. This is
 * partially mitigated by allowing changes to be merged together (overwriting them in the file), but eventually I'd
 * like to implement a way to "flatten" all changes more than N undos ago into one base state.
 */
class SaveFile {
    /** The chat history that this SaveFile is hooked up to and tracks changes of. */
    private readonly history;

    /** The file handle that this SaveFile writes to. */
    readonly fileHandle;

    /** Size of the save file so far, including buffered parts not yet written. */
    private size;

    /** Byte offset into the file where the next chunk of data should be written. */
    private writeCursor;

    /** The {@link FileWriterWorker} which actually writes into the file. */
    private worker;

    /**
     * Temporary buffer for storing serialized messages before they're written to disk. Grown if there's not enough
     * room left.
     */
    private buffer = new Uint8Array(1024);

    /** Byte offset into the temporary buffer where the next serialized message should be written. */
    private bufferCursor = 0;

    /**
     * Byte length of the previous serialized message. Used to know how much we should "back up" to overwrite it if we
     * merge the next message into it.
     */
    private prevWriteLength = -1;

    /**
     * ID of the event emitter that sent the previous serialized message. We cannot merge messages from two different
     * sources, and this lets us determine whether that's the case.
     */
    private prevChangeEmitterId: string | null = null;

    private logChangeListener;
    private undoListener;
    private redoListener;

    /** Debounced function for writing the buffered data to disk. Happens every 2 seconds. */
    private performSave;

    constructor (history: TextHistory, fileHandle: FileSystemFileHandle, size: number) {
        this.history = history;
        this.fileHandle = fileHandle;
        this.size = size;
        this.writeCursor = size;
        this.worker = new FileWriterWorker(fileHandle);

        this.logChangeListener = (event: LogChangeEvent) => {
            // We can't merge messages from 2 different emitters/sources (and also there must be a previous message).
            const canMerge = typeof event.getMerged === 'function' &&
                this.prevChangeEmitterId === event.emitterId &&
                this.prevWriteLength !== -1;

            let storedLine;
            if (canMerge) {
                storedLine = {
                    type: 'change',
                    id: event.id,
                    for: event.emitterId,
                    change: event.getMerged!()!
                };
                // Rewind the buffer so that the cursor is pointing at the start of the message we've merged with--that
                // way we'll overwrite it with the merged one.
                this.rewindBuffer(this.prevWriteLength);
            } else {
                storedLine = {
                    type: 'change',
                    id: event.id,
                    for: event.emitterId,
                    change: event.getNonMerged()!
                } satisfies EncodedLine;
            }

            this.prevChangeEmitterId = event.emitterId;
            this.writeLine(JSON.stringify(storedLine));
        };

        this.undoListener = (event: UndoEvent) => {
            const storedLine = {
                type: 'undo',
                for: event.emitterId
            } satisfies EncodedLine;
            void this.writeLine(JSON.stringify(storedLine));
        };

        this.redoListener = (event: RedoEvent) => {
            const storedLine = {
                type: 'redo',
                for: event.emitterId
            } satisfies EncodedLine;
            void this.writeLine(JSON.stringify(storedLine));
        };

        history.addEventListener('logchange', this.logChangeListener);
        history.addEventListener('undo', this.undoListener);
        history.addEventListener('redo', this.redoListener);

        // Limit the actual sending of data across a worker boundary and writing a file to occur every 2 seconds.
        this.performSave = throttle(this.performSaveNow.bind(this), 2000);
    }

    /**
     * Save all data to disk now, regardless of how long it's been since the last save.
     */
    private async performSaveNow () {
        const writeCursor = this.writeCursor;
        const bufferCursor = this.bufferCursor;
        if (bufferCursor === 0) return;
        await this.worker.write(
            this.buffer.subarray(0, bufferCursor),
            writeCursor,
            writeCursor + bufferCursor
        );
    }

    /**
     * Close this file, releasing any locks we have on it and no longer listening to any history changes. This is also
     * important to call because manually calling this is the only way to close its web worker--they will never be
     * garbage collected.
     */
    async close () {
        this.performSave.cancel();
        // Save all changes before closing
        await this.performSaveNow();
        await this.worker.close();
        this.history.removeEventListener('logchange', this.logChangeListener);
        this.history.removeEventListener('undo', this.undoListener);
        this.history.removeEventListener('redo', this.redoListener);
    }

    /**
     * Write a single line into the buffer, and queue up a file save.
     * @param line The line to write, sans trailing newline (this function appends it itself).
     */
    private writeLine (line: string) {
        this.prevWriteLength = this.writeToBuffer(line + '\n');
        this.size += this.prevWriteLength;
        this.performSave();
    }

    /**
     * "Rewind" the buffer by the given number of bytes, allowing the previous message to be overwritten. Works whether
     * the previous message is still in the buffer or has been flushed to disk. It will likely error out if you try to
     * rewind by more than one message.
     * @param amount The number of bytes to rewind the buffer by.
     */
    private rewindBuffer (amount: number) {
        this.size -= amount;
        if (this.bufferCursor === 0) {
            // The message we want to overwrite is written to disk. Rewind the write cursor so the worker overwrites the
            // data.
            this.writeCursor -= amount;
        } else if (this.bufferCursor >= amount) {
            // The message we want to overwrite is still in our buffer. Simply rewind the buffer cursor.
            this.bufferCursor -= amount;
        } else {
            // Tried to rewind the buffer more than 1 message back. Not supported.
            throw new Error(`Cannot rewind the current buffer back ${amount} bytes; trying to rewind more than 1 message back is not supported`);
        }
    }

    /**
     * Write the given text verbatim into our buffer as UTF-8, growing it if necessary to fit it all in.
     * @param text The text to write into the buffer.
     * @returns The number of bytes written.
     */
    private writeToBuffer (text: string) {
        let totalWritten = 0;
        for (;;) {
            // `read` is in UTF-16 code units, `written` is in bytes.
            const {read, written} = ENCODER.encodeInto(text, this.buffer.subarray(this.bufferCursor));
            this.bufferCursor += written;
            totalWritten += written;

            // We read all the text. No need to resize.
            if (read === text.length) break;

            // Double the buffer size.
            const buffer = new Uint8Array(this.buffer.length * 2);
            buffer.set(this.buffer.subarray(0, this.bufferCursor));
            this.buffer = buffer;

            // Write whatever text was left over on the next loop iteration.
            text = text.slice(read);
        }
        return totalWritten;
    }

    static async load (fileHandle: FileSystemFileHandle): Promise<{saveFile: SaveFile, history: TextHistory}> {
        const file = await fileHandle.getFile();

        const decoder = new TextDecoderStream();
        const fileStream = file.stream();
        fileStream.pipeThrough(decoder);

        let textBuf = '';
        const splitLines = new TransformStream<string, string>({
            transform (chunk, controller) {
                textBuf += chunk;
                const lines = textBuf.split('\n');
                textBuf = lines.pop()!;

                for (const line of lines) {
                    controller.enqueue(line);
                }
            },

            flush (controller) {
                if (textBuf.trim().length > 0) controller.enqueue(textBuf);
            }
        });
        decoder.readable.pipeThrough(splitLines);
        const lineReader = splitLines.readable.getReader();

        const history = new TextHistory();
        for (let i = 0; ; i++) {
            const line = await lineReader.read();
            if (line.done) break;
            const json = JSON.parse(line.value) as Jsonable;

            if (!jsonMatchesSchema(lineSchema, json)) {
                throw new Error(`Invalid JSON on line ${i}`);
            }

            switch (json.type) {
                case 'change':
                    history.load(json.change);
                    break;
                case 'undo':
                    history.undo();
                    break;
                case 'redo':
                    history.redo();
                    break;
            }
        }

        await fileStream.cancel();
        lineReader.releaseLock();

        return {saveFile: new SaveFile(history, fileHandle, file.size), history};
    }

    static fromExistingHistory (history: TextHistory, fileHandle: FileSystemFileHandle): SaveFile {
        const chatFile = new SaveFile(history, fileHandle, 0);
        history.replay();
        return chatFile;
    }
}

export default SaveFile;
