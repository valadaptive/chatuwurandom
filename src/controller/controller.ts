import {ChatStatus, AppState} from '../app-state';

import processPrompt from '../text-processing/process-text';

// import {makeSSEStream} from '../util/sse-stream';
import ServerSentStream from '@server-sent-stream/web';
import {batch} from '@preact/signals';

class Controller {
    private appState;

    constructor (appState: AppState) {
        this.appState = appState;
    }

    sendMessage (content: string) {
        if (this.appState.chat.status.value !== ChatStatus.IDLE) {
            throw new Error('Tried to send a message while the last one was still generating');
        }

        // Add the message content to the chat history and remove it from the chat textbox
        batch(() => {
            const history = this.appState.chat.history;
            history.update({from: history.contents.value.length, to: history.contents.value.length, insert: content});
            this.appState.chatBoxText.value = '';
            this.appState.chat.status.value = ChatStatus.GENERATING;
        });

        const history = this.appState.chat.history;
        const historyContents = history.contents.value;
        const prompt = processPrompt(historyContents, {maxContextSize: 2048});

        const apiUrl = this.appState.apiUrl.value;

        const endpointUrl = `${apiUrl}/extra/generate/stream`;

        // Fetch token stream from the koboldcpp Server-Sent Events API
        fetch(endpointUrl, {method: 'POST',
            body: JSON.stringify({prompt, max_length: 1024})})
            .then(resp => {
                const body = resp.body;
                if (!body) return;

                const decoder = new ServerSentStream();
                body.pipeThrough(decoder);
                const reader = decoder.readable.getReader();

                // TODO: handle errors
                // Read each chunk of the stream as it comes in; recursing if we haven't reached the end yet
                const push = () => {
                    void reader.read().then(({done, value}) => {
                        //const tokenStream = this.appState.chat.tokenStream.value;
                        if (done) {
                            this.appState.chat.status.value = ChatStatus.IDLE;
                            return;
                        }

                        const token = (JSON.parse(value.data) as {token: string}).token;

                        history.update({
                            from: history.contents.value.length,
                            to: history.contents.value.length,
                            insert: token
                        });

                        push();
                    });
                };

                push();
            })
            .catch(err => {
                this.appState.chat.status.value = ChatStatus.IDLE;
                // eslint-disable-next-line no-console
                console.error(err);
            });
    }
}

export default Controller;
