export type Message = ({
    type: 'setup',
    handle: FileSystemFileHandle
} | {
    type: 'write',
    data: Uint8Array,
    offset: number,
    truncateTo?: number
} | {
    type: 'close'
}) & {id: number};

export type MsgResponse = ({
    type: 'success'
} | {
    type: 'error',
    err: Error
}) & {id: number};

let handlePromise: Promise<FileSystemSyncAccessHandle> | undefined;
let closed = false;

self.addEventListener('message', async message => {
    const data = message.data as Message;
    try {
        switch (data.type) {
            case 'setup':
                if (handlePromise) throw new Error('Handle already exists');
                handlePromise = data.handle.createSyncAccessHandle();
                break;
            case 'write': {
                const handle = await handlePromise;
                if (!handle) throw new Error('Not initialized');
                handle.write(data.data, {at: data.offset});
                if (typeof data.truncateTo === 'number') {
                    handle.truncate(data.truncateTo);
                }
                handle.flush();
                break;
            }
            case 'close': {
                if (closed) throw new Error('Already closed');
                closed = true;
                const handle = await handlePromise;
                if (!handle) throw new Error('Not initialized');
                handle.flush();
                handle.close();
                break;
            }
        }

        postMessage({type: 'success', id: data.id} as const satisfies MsgResponse);
        if (data.type === 'close') {
            close();
        }
    } catch (err) {
        postMessage({type: 'error', err: err as Error, id: data.id} as const satisfies MsgResponse);
    }
});
