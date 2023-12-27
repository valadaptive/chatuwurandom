import style from './style.scss';
import type {JSX} from 'preact';

import {useAppState, ChatStatus} from '../../app-state';
import {useController} from '../../controller/context';

const MAX_ROWS = 25;

const ChatInputBox = (): JSX.Element => {
    const {chatBoxText, chat} = useAppState();
    const controller = useController();

    const onInput = (event: Event): void => {
        chatBoxText.value = (event.target as HTMLTextAreaElement).value;
    };

    const onKeyPress = (event: KeyboardEvent): void => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (chat.status.value === ChatStatus.IDLE) {
                void controller.sendMessage(chatBoxText.value);
            }
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

    return <div className={style.chatInputBox}>
        <div className={style.boxAndButtons}>
            {box}
        </div>
    </div>;
};

export default ChatInputBox;
