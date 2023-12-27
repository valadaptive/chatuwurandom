import style from './style.scss';

import {useAppState} from '../../app-state';

const SettingsPane = () => {
    const {apiUrl} = useAppState();

    return (
        <div className={style.settingsPane}>
            This will be a settings pane.
            <div className={style.setting}>
                <label>API URL:</label>
                <input
                    type="text"
                    value={apiUrl}
                    onInput={(event) => apiUrl.value = (event.target as HTMLInputElement).value}
                />
            </div>
        </div>
    );
};

export default SettingsPane;
