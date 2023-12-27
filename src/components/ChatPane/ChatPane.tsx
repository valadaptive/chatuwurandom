import style from './style.scss';

import ChatDisplay from '../ChatDisplay/ChatDisplay';
import ChatEditor from '../ChatEditor/ChatEditor';
import ChatInputBox from '../ChatInputBox/ChatInputBox';

const ChatPane = () => {
    return (
        <div className={style.chatPane}>
            {<ChatDisplay />}
            {<ChatEditor />}
            <ChatInputBox />
        </div>
    );
};

export default ChatPane;
