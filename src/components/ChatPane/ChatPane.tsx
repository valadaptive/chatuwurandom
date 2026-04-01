import style from './style.module.scss';

import ChatDisplay from '../ChatDisplay/ChatDisplay';
import ChatInputBox from '../ChatInputBox/ChatInputBox';

const ChatPane = () => {
    return (
        <div className={style.chatPane}>
            <ChatDisplay />
            <ChatInputBox />
        </div>
    );
};

export default ChatPane;
