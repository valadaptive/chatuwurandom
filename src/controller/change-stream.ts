import {Jsonable} from '../util/jsonable';
import {TypedEvent, TypedEventTarget} from '../util/typed-events';

export class LogChangeEvent extends TypedEvent<'logchange'> {
    id: string;
    emitterId: string;
    getMerged: null | (() => Jsonable);
    getNonMerged: () => Jsonable;
    constructor (id: string, emitterId: string, getMerged: null | (() => Jsonable), getNonMerged: () => Jsonable) {
        super('logchange');
        this.id = id;
        this.emitterId = emitterId;
        this.getMerged = getMerged;
        this.getNonMerged = getNonMerged;
    }
}

export class UndoEvent extends TypedEvent<'undo'> {
    emitterId: string;
    constructor (emitterId: string) {
        super('undo');
        this.emitterId = emitterId;
    }
}

export class RedoEvent extends TypedEvent<'redo'> {
    emitterId: string;
    constructor (emitterId: string) {
        super('redo');
        this.emitterId = emitterId;
    }
}

interface ChangeStream extends TypedEventTarget<LogChangeEvent | UndoEvent | RedoEvent | TypedEvent<string>> {
    id: string;

    // forces contravariance
    load <C extends Jsonable>(change: C): void;
    replay (): void;
}

export default ChangeStream;
