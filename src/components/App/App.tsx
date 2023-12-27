import style from './style.scss';

import HomePane from '../HomePane/HomePane';
import ChatPane from '../ChatPane/ChatPane';
import SettingsPane from '../SettingsPane/SettingsPane';
import TabbedPanel from '../TabbedPanel/TabbedPanel';

const App = () => {
    return (
        <div className={style.app}>
            <TabbedPanel tabs={[
                {
                    id: 'home',
                    panel: <HomePane />,
                    title: 'Home'
                },
                {
                    id: 'settings',
                    panel: <SettingsPane />,
                    title: 'Settings'
                }
            ]} initialTab='settings' />
            <ChatPane />
        </div>
    );
};

export default App;
