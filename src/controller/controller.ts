import {batch} from '@preact/signals';

import {ChatStatus, AppState} from '../app-state';

import {generateID} from '../util/id';
import {TextGenerationChangeMetadata} from './text-history';

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
    }

    async sendMessage (content: string) {
        if (this.appState.chat.status.value !== ChatStatus.IDLE) {
            throw new Error('Tried to send a message while the last one was still generating');
        }

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

        const generationId = generateID();

        this.abortController = new AbortController();
        // Cancel generation on the backend before reloading
        const beforeUnloadListener = (event: BeforeUnloadEvent) => {
            this.cancelGeneration();
            event.preventDefault();
        };
        window.addEventListener('beforeunload', beforeUnloadListener);

        try {
            const backend = this.appState.backend.value;
            const stream = await backend.generate(historyContents, this.abortController.signal);
            const reader = stream.getReader();

            for (;;) {
                const {value, done} = await reader.read();
                if (done) break;

                let {token, progress} = value;
                // I'm not sure if a CR will ever be generated, but it could desync character indices between
                // CodeMirror, which treats all newlines as one character, and our ChatHistory class, which
                // treats \r\n as two characters.
                token = token.replace(/\r/g, '');

                batch(() => {
                    if (token.length > 0) history.update({
                        from: history.contents.value.length,
                        to: history.contents.value.length,
                        inserted: token,
                        timestamp: Date.now(),
                        metadata: {
                            textgen: new TextGenerationChangeMetadata(generationId)
                        }
                    });

                    this.appState.chat.generationProgress.value = progress;
                });
            }
        } catch (err) {
            // TODO: display errors in the UI
            // eslint-disable-next-line no-console
            console.error(err);
        }

        this.appState.chat.status.value = ChatStatus.IDLE;
        this.abortController = null;
        window.removeEventListener('beforeunload', beforeUnloadListener);
    }
}

export default Controller;
