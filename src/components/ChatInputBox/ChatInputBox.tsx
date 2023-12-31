import style from './style.scss';

import type {JSX} from 'preact';
import {useComputed} from '@preact/signals';
import classNames from 'classnames';

import {useAppState, ChatStatus} from '../../app-state';
import {useController} from '../../controller/context';
import Icon from '../Icon/Icon';

const MAX_ROWS = 25;

const ChatInputBox = (): JSX.Element => {
    const {chatBoxText, chat} = useAppState();
    const controller = useController();

    const onInput = (event: Event): void => {
        chatBoxText.value = (event.target as HTMLTextAreaElement).value;
    };

    const sendMessage = () => {
        if (chat.status.value === ChatStatus.IDLE) {
            void controller.sendMessage(chatBoxText.value);
        }
    };

    const onKeyPress = (event: KeyboardEvent): void => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    };

    const box = <textarea
        className={style.textbox}
        value={chatBoxText}
        onInput={onInput}
        onKeyPress={onKeyPress}
        disabled={false /* TODO: disable if no model connected */}
        rows={Math.min((chatBoxText.value.match(/\n/g)?.length ?? 0) + 1, MAX_ROWS)}
    />;

    const loadingBar = useComputed(() => {
        if (chat.status.value !== ChatStatus.GENERATING) {
            return <div className={classNames(style.loadingBar, style.hidden)} />;
        }

        return (
            <div className={style.loadingBar}>
                <div className={style.loadingBarInner} style={{width: `${chat.generationProgress.value * 100}%`}} />
            </div>
        );
    });

    return <div className={style.chatInputBox}>
        {loadingBar}
        <div className={style.boxAndButtons}>
            {box}

            <div className={style.buttons}>
                {chat.status.value === ChatStatus.GENERATING ?
                    <Icon type='cancel' title='Cancel' onClick={() => controller.cancelGeneration()} /> :
                    <Icon type='send' title='Send' onClick={sendMessage} />}
                <Icon type='undo' title='Undo' onClick={() => chat.history.undo()} />
                <Icon type='redo' title='Redo' onClick={() => chat.history.redo()} />
                <Icon type='retry' title='Retry' onClick={() => {
                    chat.history.undo();
                    sendMessage();
                }} />
            </div>
        </div>
    </div>;
};

export default ChatInputBox;
