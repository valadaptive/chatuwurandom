import type {JSX} from 'preact';

import type {Jsonable} from '../util/jsonable';

export interface AIBackend {
    id: string;
    connect(): Promise<unknown>
    generate(
        prompt: string,
        settings: {grammar: string},
        signal?: AbortSignal
    ): Promise<ReadableStream<{token: string, progress: number}>>
    saveSettings(): Jsonable,
    loadSettings(settingsJson: Jsonable): void;
    SettingsPanel(): JSX.Element
}
