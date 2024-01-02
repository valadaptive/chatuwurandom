import type {JSX} from 'preact';

export type Jsonable = string | number | boolean | null | undefined | {[x: string]: Jsonable} | Jsonable[];

export interface AIBackend {
    id: string;
    connect(): Promise<unknown>
    generate(prompt: string, signal?: AbortSignal): Promise<ReadableStream<{token: string, progress: number}>>
    saveSettings(): Jsonable,
    loadSettings(settingsJson: Jsonable): void;
    SettingsPanel(): JSX.Element
}
