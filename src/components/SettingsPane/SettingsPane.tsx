import style from './style.scss';

import {useAppState} from '../../app-state';
import {useComputed} from '@preact/signals';

const SettingsPane = () => {
    const {backend} = useAppState();

    const SettingsPanel = useComputed(() => backend.value.SettingsPanel.bind(backend.value)).value;

    return (
        <div className={style.settingsPane}>
            <SettingsPanel />
        </div>
    );
};

export default SettingsPane;
