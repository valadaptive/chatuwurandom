import style from './style.module.scss';

import ChatPane from '../ChatPane/ChatPane';

const App = () => {
    return (
        <div className={style.app}>
            <ChatPane />
        </div>
    );
};

export default App;
