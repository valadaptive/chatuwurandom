import ServerSentStream from '@server-sent-stream/web';
import {batch} from '@preact/signals';

import {ChatStatus, AppState} from '../app-state';

import processPrompt from '../text-processing/process-text';
import {generateID} from '../util/id';
import {TextGenerationChangeMetadata} from './chat-history';

class Controller {
    private appState;
    private abortController: AbortController | null = null;

    constructor (appState: AppState) {
        this.appState = appState;
    }

    cancelGeneration () {
        if (this.appState.chat.status.value !== ChatStatus.GENERATING) return;
        if (this.abortController) {
            this.abortController.abort('Generation cancelled');
            this.abortController = null;
        }
        const apiUrl = this.appState.apiUrl.value;
        const endpointUrl = `${apiUrl}/extra/abort`;
        void fetch(endpointUrl, {method: 'POST'});
    }

    sendMessage (content: string) {
        if (this.appState.chat.status.value !== ChatStatus.IDLE) {
            throw new Error('Tried to send a message while the last one was still generating');
        }

        const tokensToGenerate = 1024;
        let tokenCount = 0;

        // Add the message content to the chat history and remove it from the chat textbox
        batch(() => {
            const history = this.appState.chat.history;
            history.update({
                from: history.contents.value.length,
                to: history.contents.value.length,
                inserted: content,
                timestamp: Date.now()
            });
            this.appState.chatBoxText.value = '';
            this.appState.chat.status.value = ChatStatus.GENERATING;
            this.appState.chat.generationProgress.value = 0;
        });

        const history = this.appState.chat.history;
        const historyContents = history.contents.value;
        const prompt = processPrompt(historyContents, {maxContextSize: 2048});

        const apiUrl = this.appState.apiUrl.value;

        const endpointUrl = `${apiUrl}/extra/generate/stream`;

        const generationId = generateID();

        this.abortController = new AbortController();

        // Cancel generation on the backend before reloading
        const beforeUnloadListener = (event: BeforeUnloadEvent) => {
            this.cancelGeneration();
            window.removeEventListener('beforeunload', beforeUnloadListener);
            event.preventDefault();
        };
        window.addEventListener('beforeunload', beforeUnloadListener);

        // Fetch token stream from the koboldcpp Server-Sent Events API
        fetch(endpointUrl, {
            method: 'POST',
            body: JSON.stringify({prompt, max_length: tokensToGenerate}),
            signal: this.abortController.signal
        })
            .then(resp => {
                const body = resp.body;
                if (!body) return;

                const decoder = new ServerSentStream();
                body.pipeThrough(decoder);
                const reader = decoder.readable.getReader();

                // TODO: handle errors
                // Read each chunk of the stream as it comes in; recursing if we haven't reached the end yet
                const push = (): Promise<void> => {
                    return reader.read().then(({done, value}) => {
                        //const tokenStream = this.appState.chat.tokenStream.value;
                        if (done) {
                            this.appState.chat.status.value = ChatStatus.IDLE;
                            this.abortController = null;
                            window.removeEventListener('beforeunload', beforeUnloadListener);
                            return;
                        }

                        let token = (JSON.parse(value.data) as {token: string}).token;
                        // I'm not sure if a CR will ever be generated, but it could desync character indices between
                        // CodeMirror, which treats all newlines as one character, and our ChatHistory class, which
                        // treats \r\n as two characters.
                        token = token.replace(/\r/g, '');

                        tokenCount++;

                        if (token.length === 0) return push();

                        batch(() => {
                            history.update({
                                from: history.contents.value.length,
                                to: history.contents.value.length,
                                inserted: token,
                                timestamp: Date.now(),
                                metadata: {
                                    textgen: new TextGenerationChangeMetadata(generationId)
                                }
                            });

                            this.appState.chat.generationProgress.value = tokenCount / tokensToGenerate;
                        });


                        return push();
                    });
                };

                return push();
            })
            .catch(err => {
                this.appState.chat.status.value = ChatStatus.IDLE;
                // eslint-disable-next-line no-console
                console.error(err);
            });
    }
}

export default Controller;
