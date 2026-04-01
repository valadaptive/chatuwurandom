import {batch} from '@preact/signals';
import {TreeFragment} from '@lezer/common';

import {ChatStatus, AppState, StreamState} from '../app-state';
import {parser} from '../text-processing/markdown';
import {generateID} from '../util/id';
import type {Message, Attachment} from './message';
import {UwurandomState, DestBuffer} from 'uwurandom';

const BUFFER_SIZE = 64;
const CHARS_PER_FRAME = 20;
const MIN_LENGTH = 150;
const MAX_LENGTH = 6000;
/** Start looking for a double newline to break at once we exceed this fraction of the target. */
const SOFT_LIMIT = 1.0;
/** Accept a single newline once we exceed this fraction of the target. */
const HARD_LIMIT = 1.5;
/** Force-stop at this fraction of the target regardless. */
const FORCE_LIMIT = 1.75;

class Controller {
    private appState;
    private cancelled = false;

    constructor (appState: AppState) {
        this.appState = appState;
    }

    cancelGeneration () {
        const status = this.appState.chat.status.value;
        if (status !== ChatStatus.GENERATING && status !== ChatStatus.THINKING) return;
        this.cancelled = true;
    }

    retry () {
        const {chat} = this.appState;
        if (chat.status.value !== ChatStatus.IDLE) return;

        const messages = chat.messages.value;
        if (messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role !== 'assistant') return;

        chat.messages.value = messages.slice(0, -1);
        void this.generate();
    }

    async sendMessage (content: string, attachments?: Attachment[]) {
        if (this.appState.chat.status.value !== ChatStatus.IDLE) {
            throw new Error('Tried to send a message while the last one was still generating');
        }

        const userMessage: Message = {
            id: generateID(),
            role: 'user',
            content,
            attachments: attachments?.length ? attachments : undefined
        };

        batch(() => {
            this.appState.chat.messages.value = [...this.appState.chat.messages.value, userMessage];
            this.appState.chatBoxText.value = '';
        });

        await this.generate();
    }

    private async generate () {
        const {chat} = this.appState;

        this.cancelled = false;
        chat.status.value = ChatStatus.THINKING;

        // Pretend to think for a bit
        const thinkTime = 1500 + (Math.random() * 4500);
        await new Promise<void>(resolve => setTimeout(resolve, thinkTime));

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.cancelled) {
            chat.status.value = ChatStatus.IDLE;
            return;
        }

        chat.status.value = ChatStatus.GENERATING;

        const uwuState = new UwurandomState();
        const destBuffer = new DestBuffer(BUFFER_SIZE);

        let currentContent = '';
        const initialTree = parser.parse('');
        let streamState: StreamState = {
            content: '',
            tree: initialTree,
            fragments: TreeFragment.addTree(initialTree)
        };
        chat.streamState.value = streamState;

        let dripBuffer = '';
        let dripCursor = 0;
        let totalCharsEmitted = 0;

        const targetLength = MIN_LENGTH + (Math.random() * (MAX_LENGTH - MIN_LENGTH));

        try {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            while (!this.cancelled) {
                if (dripCursor >= dripBuffer.length) {
                    uwuState.generate(destBuffer);
                    dripBuffer = destBuffer.asText();
                    dripCursor = 0;
                }

                const charsThisFrame = Math.min(
                    CHARS_PER_FRAME,
                    dripBuffer.length - dripCursor
                );
                let newChars = dripBuffer.slice(dripCursor, dripCursor + charsThisFrame);
                dripCursor += charsThisFrame;

                // Once past the soft limit, look for a good place to stop
                let done = false;
                const projected = totalCharsEmitted + newChars.length;
                if (projected >= targetLength * SOFT_LIMIT) {
                    const doubleNewline = newChars.indexOf('\n\n');
                    if (doubleNewline !== -1) {
                        newChars = newChars.slice(0, doubleNewline);
                        done = true;
                    } else if (projected >= targetLength * HARD_LIMIT) {
                        const singleNewline = newChars.indexOf('\n');
                        if (singleNewline !== -1) {
                            newChars = newChars.slice(0, singleNewline);
                            done = true;
                        }
                    }

                    if (!done && projected >= targetLength * FORCE_LIMIT) {
                        done = true;
                    }
                }

                totalCharsEmitted += newChars.length;
                const oldLen = currentContent.length;
                currentContent += newChars;

                let {fragments} = streamState;
                fragments = TreeFragment.applyChanges(fragments, [{
                    fromA: oldLen,
                    toA: oldLen,
                    fromB: oldLen,
                    toB: currentContent.length
                }]);
                const tree = parser.parse(currentContent, fragments);
                fragments = TreeFragment.addTree(tree, fragments);

                streamState = {content: currentContent, tree, fragments};
                chat.streamState.value = streamState;

                if (done) break;

                await new Promise<void>(resolve => setTimeout(resolve, 25));
            }
        } finally {
            destBuffer.destroy();
            uwuState.destroy();

            const assistantMessage: Message = {
                id: generateID(),
                role: 'assistant',
                content: currentContent
            };

            batch(() => {
                chat.messages.value = [...chat.messages.value, assistantMessage];
                chat.streamState.value = null;
                chat.status.value = ChatStatus.IDLE;
            });

            this.cancelled = false;
        }
    }
}

export default Controller;
