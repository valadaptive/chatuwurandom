import {signal, Signal} from '@preact/signals';
import {TypedEvent, TypedEventTarget} from '../util/typed-events';

export type ChatChange = {
    from: number,
    to: number,
    insert?: string
};

export class ChatChangeEvent extends TypedEvent<'chatchange'> {
    change;
    constructor (change: ChatChange) {
        super('chatchange');
        this.change = change;
    }
}

export class ChatHistory extends TypedEventTarget<ChatChangeEvent> {
    contents: Signal<string>;

    constructor (contents = '') {
        super();

        this.contents = signal(contents);
    }

    private applyChange (change: ChatChange) {
        const oldContents = this.contents.value;

        this.contents.value = oldContents.slice(0, change.from) +
            (change.insert ?? '') +
            oldContents.slice(change.to, oldContents.length);
    }

    update (change: ChatChange) {
        this.applyChange(change);

        this.dispatchEvent(new ChatChangeEvent(change));
    }
}
