import type {JSX} from 'preact';
import {Signal, signal} from '@preact/signals';
import EventSourceStream from '@server-sent-stream/web';
import {useCallback} from 'preact/hooks';

import {AIBackend, Jsonable} from './ai-backend';
import {
    Setting,
    SettingRow,
    RangeSetting,
    SelectSetting,
    SettingsSection,
    TextSetting
} from '../components/Settings/Settings';
import Indicator, {IndicatorState} from '../components/Indicator/Indicator';
import processPrompt from '../text-processing/process-text';
import {Schema, jsonMatchesSchema} from '../util/validate-json';
import {mergeInto} from '../util/merge';

type ConnectionStatus = {
    status: 'disconnected' | 'connected' | 'connecting'
} | {
    status: 'failed',
    error: string
};

const enum MirostatMode {
    DISABLED,
    V1,
    V2
}

const settingsSchema = {
    type: 'object',
    partial: true,
    properties: {
        apiUrl: 'string',
        outputLength: 'number',
        temperature: 'number',
        repetitionPenalty: {
            type: 'object',
            partial: true,
            properties: {
                penalty: 'number',
                lastN: 'number'
            }
        },
        topA: 'number',
        topK: 'number',
        topP: 'number',
        minP: 'number',
        tailFreeSampling: 'number',
        typicalSampling: 'number',
        mirostat: {
            type: 'object',
            partial: true,
            properties: {
                mode: 'number',
                learningRate: 'number',
                targetEntropy: 'number'
            }

        },
        banEOS: 'boolean'
    }
} as const satisfies Schema;

class KoboldCppBackend implements AIBackend {
    public id = 'koboldcpp';

    private info: Signal<{
        model: string,
        version: string,
        maxContextLength: number
    } | null> = signal(null);

    private settings: {
        apiUrl: Signal<string>,
        outputLength: Signal<number>,
        temperature: Signal<number>,
        repetitionPenalty: {
            penalty: Signal<number>,
            lastN: Signal<number>
        },
        topA: Signal<number>,
        topK: Signal<number>,
        topP: Signal<number>,
        minP: Signal<number>,
        tailFreeSampling: Signal<number>,
        typicalSampling: Signal<number>,
        mirostat: {
            mode: Signal<MirostatMode>,
            learningRate: Signal<number>,
            targetEntropy: Signal<number>
        },
        banEOS: Signal<boolean>
    } = {
            apiUrl: signal(''),
            outputLength: signal(200),
            temperature: signal(0.8),
            repetitionPenalty: {
                penalty: signal(1.1),
                lastN: signal(64)
            },
            topA: signal(0),
            topK: signal(0),
            topP: signal(1),
            minP: signal(0),
            tailFreeSampling: signal(1),
            typicalSampling: signal(1),
            mirostat: {
                mode: signal(MirostatMode.DISABLED),
                learningRate: signal(0.1),
                targetEntropy: signal(5)
            },
            banEOS: signal(false)
        };

    private connectionStatus: Signal<ConnectionStatus> = signal({status: 'disconnected'});

    private async fetchAPI (endpoint: string, init?: RequestInit): Promise<Response> {
        const apiUrl = this.settings.apiUrl.value;
        if (apiUrl === '') {
            throw new Error('No API URL set');
        }

        const response = await fetch(`${apiUrl}${endpoint}`, init);
        if (!response.ok) throw new Error(response.statusText);
        return response;
    }

    private asSchema<Schema = unknown> (resp: Promise<Response>): Promise<Schema> {
        return resp.then(resp => resp.json() as Schema);
    }

    async connect () {
        this.connectionStatus.value = {status: 'connecting'};

        try {
            const fetchModel = this.asSchema<{result: string}>(this.fetchAPI('/v1/model'));
            const fetchVersion = this.asSchema<{result: string, version: string}>(this.fetchAPI('/extra/version'));
            const fetchMaxContextLength = this.asSchema<{value: number}>(
                this.fetchAPI('/extra/true_max_context_length'));

            const [modelResponse, versionResponse, maxContextLengthResponse] = await Promise.all([
                fetchModel,
                fetchVersion,
                fetchMaxContextLength
            ]);

            this.info.value = {
                model: modelResponse.result,
                version: `${versionResponse.result} ${versionResponse.version}`,
                maxContextLength: maxContextLengthResponse.value
            };

            this.connectionStatus.value = {status: 'connected'};
        } catch (err) {
            this.connectionStatus.value = {status: 'failed', error: String(err)};
        }
    }

    async generate (prompt: string, signal?: AbortSignal): Promise<ReadableStream<{token: string, progress: number}>> {
        if (!this.info.value) throw new Error('Not connected');

        prompt = processPrompt(prompt, {maxContextSize: this.info.value.maxContextLength});

        const maxLength = this.settings.outputLength.value;

        // TODO: max_content_length, sampler_order, sampler_seed, stop_sequence, grammar, grammar_retain_state, memory
        const params = {
            prompt,
            max_length: maxLength,
            rep_pen: this.settings.repetitionPenalty.penalty.value,
            rep_pen_range: this.settings.repetitionPenalty.lastN.value,
            temperature: this.settings.temperature.value,
            tfs: this.settings.tailFreeSampling.value,
            top_a: this.settings.topA.value,
            top_k: this.settings.topK.value,
            top_p: this.settings.topP.value,
            min_p: this.settings.minP.value,
            typical: this.settings.typicalSampling.value,
            use_default_badwordsids: this.settings.banEOS.value,
            mirostat: this.settings.mirostat.mode.value,
            mirostat_tau: this.settings.mirostat.targetEntropy.value,
            mirostat_eta: this.settings.mirostat.learningRate.value
        };

        const response = this.fetchAPI('/extra/generate/stream', {
            method: 'POST',
            body: JSON.stringify(params),
            signal
        });

        const abortListener = () => {
            void this.fetchAPI('/extra/abort', {method: 'POST'});
            signal?.removeEventListener('abort', abortListener);
        };

        signal?.addEventListener('abort', abortListener);

        const {body} = await response;
        if (!body) throw new Error('Response has no body');

        const decoder = new EventSourceStream();
        body.pipeThrough(decoder);

        let tokenCount = 0;

        const tokenTransform = new TransformStream<MessageEvent<string>, {token: string, progress: number}>({
            transform (chunk: MessageEvent<string>, controller) {
                const token = (JSON.parse(chunk.data) as {token: string}).token;
                tokenCount++;
                controller.enqueue({token, progress: tokenCount / maxLength});
            },

            flush () {
                signal?.removeEventListener('abort', abortListener);
            }
        });
        decoder.readable.pipeThrough(tokenTransform);
        return tokenTransform.readable;
    }

    saveSettings () {
        return {
            version: 1,
            apiUrl: this.settings.apiUrl.value,
            outputLength: this.settings.outputLength.value,
            temperature: this.settings.temperature.value,
            repetitionPenalty: {
                penalty: this.settings.repetitionPenalty.penalty.value,
                lastN: this.settings.repetitionPenalty.lastN.value
            },
            topA: this.settings.topA.value,
            topK: this.settings.topK.value,
            topP: this.settings.topP.value,
            minP: this.settings.minP.value,
            tailFreeSampling: this.settings.tailFreeSampling.value,
            typicalSampling: this.settings.typicalSampling.value,
            mirostat: {
                mode: this.settings.mirostat.mode.value,
                learningRate: this.settings.mirostat.learningRate.value,
                targetEntropy: this.settings.mirostat.targetEntropy.value
            },
            banEOS: this.settings.banEOS.value
        };
    }
    loadSettings (settingsJson: Jsonable): void {
        if (typeof settingsJson !== 'object' || Array.isArray(settingsJson)) return;
        if (settingsJson?.version !== 1) return;

        if (!jsonMatchesSchema(settingsSchema, settingsJson)) {
            return;
        }

        mergeInto(this.settings, settingsJson);
    }

    SettingsPanel (): JSX.Element {
        let indicatorState, indicatorMessage;
        switch (this.connectionStatus.value.status) {
            case 'disconnected':
                indicatorState = IndicatorState.DISABLED;
                indicatorMessage = 'Not connected';
                break;
            case 'connecting':
                indicatorState = IndicatorState.LOADING;
                indicatorMessage = 'Connecting...';
                break;
            case 'connected':
                indicatorState = IndicatorState.SUCCESS;
                indicatorMessage = 'Connected';
                break;
            case 'failed':
                indicatorState = IndicatorState.FAILED;
                indicatorMessage = this.connectionStatus.value.error;
                break;
        }

        const connect = useCallback(this.connect.bind(this), []);

        return (
            <>
                <SettingsSection name='API'>
                    <Setting name='API URL' description='The URL that the KoboldCpp server is running on.'>
                        <TextSetting value={this.settings.apiUrl} onEnter={connect}/>
                        <SettingRow>
                            <button onClick={connect}>Connect</button>
                            <Indicator state={indicatorState} />
                            <div>{indicatorMessage}</div>
                        </SettingRow>
                    </Setting>
                </SettingsSection>
                <SettingsSection name='Generation'>
                    <Setting name='Output Length' description='Number of tokens generated.'>
                        <RangeSetting
                            min={0}
                            max={this.info.value?.maxContextLength ?? 2048}
                            value={this.settings.outputLength}
                        />
                    </Setting>
                    <Setting name='Temperature' description='The "randomness" of the generated text.'>
                        <RangeSetting
                            min={0}
                            max={1}
                            step={0.01}
                            value={this.settings.temperature}
                        />
                    </Setting>
                    <Setting
                        name='Ban EOS'
                        description='Prevent the EOS token from being generated.'
                        enabled={this.settings.banEOS}
                    />
                    <SettingsSection name='Repetition Penalty'>
                        <Setting
                            name='Penalty'
                            description='Control the repetition of token sequences in the generated text.'
                        >
                            <RangeSetting
                                min={1}
                                max={3}
                                step={0.01}
                                value={this.settings.repetitionPenalty.penalty}
                            />
                        </Setting>
                        <Setting
                            name='Range'
                            description='Number of tokens to scan backwards when penalizing repetition.'
                        >
                            <RangeSetting
                                min={0}
                                max={this.info.value?.maxContextLength ?? 2048}
                                step={1}
                                value={this.settings.repetitionPenalty.lastN}
                            />
                        </Setting>
                    </SettingsSection>
                    <Setting
                        name='Top-A Sampling'
                        // eslint-disable-next-line max-len
                        description='Set a threshold for token selection based on the square of the highest token probability.'
                    >
                        <RangeSetting
                            min={0}
                            max={1}
                            step={0.01}
                            value={this.settings.topA}
                        />
                    </Setting>
                    <Setting
                        name='Top-K Sampling'
                        description='Limit the next token selection to the K most probable tokens.'
                    >
                        <RangeSetting
                            min={0}
                            max={100}
                            step={1}
                            value={this.settings.topK}
                        />
                    </Setting>
                    <Setting
                        name='Top-P Sampling'
                        // eslint-disable-next-line max-len
                        description='Limit the next token selection to a subset of tokens with a cumulative probability above a threshold P.'
                    >
                        <RangeSetting
                            min={0}
                            max={1}
                            step={0.01}
                            value={this.settings.topP}
                        />
                    </Setting>
                    <Setting
                        name='Min-P Sampling'
                        // eslint-disable-next-line max-len
                        description='The minimum base probability threshold for token selection.'
                    >
                        <RangeSetting
                            min={0}
                            max={1}
                            step={0.01}
                            value={this.settings.minP}
                        />
                    </Setting>
                    <Setting
                        name='Tail-Free Sampling'
                        // eslint-disable-next-line max-len
                        description='Filter tokens based on the second derivative of their probabilities.'
                    >
                        <RangeSetting
                            min={0}
                            max={1}
                            step={0.01}
                            value={this.settings.tailFreeSampling}
                        />
                    </Setting>
                    <Setting
                        name='Typical Sampling'
                        // eslint-disable-next-line max-len
                        description="Prioritize tokens based on whether they're expected in the surrounding context."
                    >
                        <RangeSetting
                            min={0}
                            max={1}
                            step={0.01}
                            value={this.settings.typicalSampling}
                        />
                    </Setting>
                    <SettingsSection name='Mirostat'>
                        <Setting
                            name='Mode'
                        >
                            <SelectSetting
                                value={this.settings.mirostat.mode}
                                options={[
                                    {id: MirostatMode.DISABLED, name: 'Disabled'},
                                    {id: MirostatMode.V1, name: 'Version 1'},
                                    {id: MirostatMode.V2, name: 'Version 2'}
                                ]}
                            />
                        </Setting>
                        <Setting
                            name='Learning Rate'
                            description='How quickly the algorithm responds to the generated text.'
                        >
                            <RangeSetting
                                min={0}
                                max={1}
                                step={0.01}
                                value={this.settings.mirostat.learningRate}
                            />
                        </Setting>
                        <Setting
                            name='Target Entropy'
                            description='Target entropy/perplexity in the generated text.'
                        >
                            <RangeSetting
                                min={0}
                                max={20}
                                step={0.01}
                                value={this.settings.mirostat.targetEntropy}
                            />
                        </Setting>
                    </SettingsSection>
                </SettingsSection>
            </>
        );
    }
}

export default KoboldCppBackend;
