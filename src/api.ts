import * as r from '@typoas/runtime';
export type BasicError = {
    msg: string;
    type: string;
};
export type BasicResult = {
    result: BasicResultInner;
};
export type BasicResultInner = {
    result: string;
};
export type GenerationInput = {
    /**
     * Maximum number of tokens to send to the model.
     */
    max_context_length?: number;
    /**
     * Number of tokens to generate.
     */
    max_length?: number;
    /**
     * This is the submission.
     */
    prompt: string;
    /**
     * Base repetition penalty value.
     */
    rep_pen?: number;
    /**
     * Repetition penalty range.
     */
    rep_pen_range?: number;
    /**
     * Sampler order to be used. If N is the length of this array, then N must be greater than or equal to 6 and the array must be a permutation of the first N non-negative integers.
     */
    sampler_order?: number[];
    /**
     * RNG seed to use for sampling. If not specified, the global RNG will be used.
     */
    sampler_seed?: number;
    /**
     * An array of string sequences where the API will stop generating further tokens. The returned text WILL contain the stop sequence.
     */
    stop_sequence?: string[];
    /**
     * Temperature value.
     */
    temperature?: number;
    /**
     * Tail free sampling value.
     */
    tfs?: number;
    /**
     * Top-a sampling value.
     */
    top_a?: number;
    /**
     * Top-k sampling value.
     */
    top_k?: number;
    /**
     * Top-p sampling value.
     */
    top_p?: number;
    /**
     * Min-p sampling value.
     */
    min_p?: number;
    /**
     * Typical sampling value.
     */
    typical?: number;
    /**
     * If true, prevents the EOS token from being generated (Ban EOS). For unbantokens, set this to false.
     */
    use_default_badwordsids?: boolean;
    /**
     * KoboldCpp ONLY. Sets the mirostat mode, 0=disabled, 1=mirostat_v1, 2=mirostat_v2
     */
    mirostat?: number;
    /**
     * KoboldCpp ONLY. Mirostat tau value.
     */
    mirostat_tau?: number;
    /**
     * KoboldCpp ONLY. Mirostat eta value.
     */
    mirostat_eta?: number;
    /**
     * KoboldCpp ONLY. A unique genkey set by the user. When checking a polled-streaming request, use this key to be able to fetch pending text even if multiuser is enabled.
     */
    genkey?: string;
    /**
     * KoboldCpp ONLY. A string containing the GBNF grammar to use.
     */
    grammar?: string;
    /**
     * KoboldCpp ONLY. If true, retains the previous generation's grammar state, otherwise it is reset on new generation.
     */
    grammar_retain_state?: boolean;
    /**
     * KoboldCpp ONLY. If set, forcefully appends this string to the beginning of any submitted prompt text. If resulting context exceeds the limit, forcefully overwrites text from the beginning of the main prompt until it can fit. Useful to guarantee full memory insertion even when you cannot determine exact token count.
     */
    memory?: string;
    /**
     * KoboldCpp ONLY. If true, also removes detected stop_sequences from the output and truncates all text after them. Does not work with SSE streaming.
     */
    trim_stop?: boolean;
};
export type GenerationOutput = {
    /**
     * Array of generated outputs.
     */
    results: GenerationResult[];
};
export type GenerationResult = {
    /**
     * Generated output as plain text.
     */
    text: string;
};
export type MaxContextLengthSetting = {
    value: number;
};
export type MaxLengthSetting = {
    value: number;
};
export type ServerBusyError = {
    detail: BasicError;
};
export type ValueResult = {
    value: number;
};
export type KcppVersion = {
    result?: string;
    version: string;
};
export type KcppPerf = {
    /**
     * Last processing time in seconds.
     */
    last_process?: number;
    /**
     * Last evaluation time in seconds.
     */
    last_eval?: number;
    /**
     * Last token count.
     */
    last_token_count?: number;
    /**
     * Total requests generated since startup.
     */
    total_gens?: number;
    /**
     * Reason the generation stopped. INVALID=-1, OUT_OF_TOKENS=0, EOS_TOKEN=1, CUSTOM_STOPPER=2
     */
    stop_reason?: number;
    /**
     * Length of generation queue.
     */
    queue?: number;
    /**
     * Status of backend, busy or idle.
     */
    idle?: number;
};
export type AuthMethods = {};
export function createContext<FetcherData>(params?: r.CreateContextParams<AuthMethods, FetcherData>): r.Context<AuthMethods, FetcherData> { return new r.Context<AuthMethods, FetcherData>({
    serverConfiguration: new r.ServerConfiguration('/api', {}),
    authMethods: {},
    ...params
}); }
/**
 * Retrieve the current max context length setting value that horde sees
 * Tags: v1
 */
export async function v1ConfigMaxContextLengthGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<MaxContextLengthSetting> {
    const req = await ctx.createRequest({
        path: '/v1/config/max_context_length',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Retrieve the current max length (amount to generate) setting value
 * Tags: v1
 */
export async function v1ConfigMaxLengthGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<MaxLengthSetting> {
    const req = await ctx.createRequest({
        path: '/v1/config/max_length',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Generate text with a specified prompt
 * Generates text given a prompt and generation settings.
 *
 * Unspecified values are set to defaults.
 * Tags: v1
 */
export async function v1GeneratePost<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, body: GenerationInput, opts?: FetcherData): Promise<GenerationOutput> {
    const req = await ctx.createRequest({
        path: '/v1/generate',
        params,
        method: r.HttpMethod.POST,
        body
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Current KoboldAI United API version
 * Returns the matching *KoboldAI* (United) version of the API that you are currently using. This is not the same as the
 * KoboldCpp API version - this is used to feature match against KoboldAI United.
 * Tags: v1
 */
export async function v1InfoVersionGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<BasicResult> {
    const req = await ctx.createRequest({
        path: '/v1/info/version',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Retrieve the current model string from hordeconfig
 * Gets the current model display name, set with hordeconfig.
 * Tags: v1
 */
export async function v1ModelGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<BasicResult> {
    const req = await ctx.createRequest({
        path: '/v1/model',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Retrieve the actual max context length setting value set from the launcher
 * Retrieve the actual max context length setting value set from the launcher
 * Tags: extra
 */
export async function extraTrueMaxContextLengthGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<MaxContextLengthSetting> {
    const req = await ctx.createRequest({
        path: '/extra/true_max_context_length',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Retrieve the KoboldCpp backend version
 * Retrieve the KoboldCpp backend version
 * Tags: extra
 */
export async function extraVersionGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<KcppVersion> {
    const req = await ctx.createRequest({
        path: '/extra/version',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Retrieves the KoboldCpp preloaded story
 * Retrieves the KoboldCpp preloaded story, --preloadstory configures a prepared story json save file to be hosted on the
 * server, which frontends (such as Kobold Lite) can access over the API.
 * Tags: extra
 */
export async function extraPreloadstoryGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<any> {
    const req = await ctx.createRequest({
        path: '/extra/preloadstory',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Retrieve the KoboldCpp recent performance information
 * Retrieve the KoboldCpp recent performance information
 * Tags: extra
 */
export async function extraPerfGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<KcppPerf> {
    const req = await ctx.createRequest({
        path: '/extra/perf',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Generate text with a specified prompt. SSE streamed results.
 * Generates text given a prompt and generation settings, with SSE streaming.
 *
 * Unspecified values are set to defaults.
 *
 * SSE
 * streaming establishes a persistent connection, returning ongoing process in the form of message events.
 *
 * ```
 * event:
 * message
 * data: {data}
 *
 * ```
 * Tags: extra
 */
export async function extraGenerateStreamPost<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, body: GenerationInput, opts?: FetcherData): Promise<GenerationOutput> {
    const req = await ctx.createRequest({
        path: '/extra/generate/stream',
        params,
        method: r.HttpMethod.POST,
        body
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Poll the incomplete results of the currently ongoing text generation.
 * Poll the incomplete results of the currently ongoing text generation. Will not work when multiple requests are in queue.
 * Tags: extra
 */
export async function extraGenerateCheckGet<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, opts?: FetcherData): Promise<GenerationOutput> {
    const req = await ctx.createRequest({
        path: '/extra/generate/check',
        params,
        method: r.HttpMethod.GET
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Poll the incomplete results of the currently ongoing text generation. Supports multiuser mode.
 * Poll the incomplete results of the currently ongoing text generation. A unique genkey previously submitted allows
 * polling even in multiuser mode.
 * Tags: extra
 */
export async function extraGenerateCheckPost<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, body: {
    /**
     * A unique key used to identify this generation while it is in progress.
     */
    genkey?: string;
}, opts?: FetcherData): Promise<GenerationOutput> {
    const req = await ctx.createRequest({
        path: '/extra/generate/check',
        params,
        method: r.HttpMethod.POST,
        body
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Counts the number of tokens in a string.
 * Counts the number of tokens in a string.
 * Tags: extra
 */
export async function extraTokencountPost<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, body: {
    /**
     * The string to be tokenized.
     */
    prompt?: string;
}, opts?: FetcherData): Promise<ValueResult> {
    const req = await ctx.createRequest({
        path: '/extra/tokencount',
        params,
        method: r.HttpMethod.POST,
        body
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
/**
 * Aborts the currently ongoing text generation.
 * Aborts the currently ongoing text generation. Does not work when multiple requests are in queue.
 * Tags: extra
 */
export async function extraAbortPost<FetcherData>(ctx: r.Context<AuthMethods, FetcherData>, params: {}, body: {
    /**
     * A unique key used to identify this generation while it is in progress.
     */
    genkey?: string;
}, opts?: FetcherData): Promise<any> {
    const req = await ctx.createRequest({
        path: '/extra/abort',
        params,
        method: r.HttpMethod.POST,
        body
    });
    const res = await ctx.sendRequest(req, opts);
    return ctx.handleResponse(res, {});
}
