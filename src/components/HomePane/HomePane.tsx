import style from './style.scss';

import FileView from '../FileView/FileView';

const HomePane = () => {
    return (
        <div className={style.homePane}>
            <FileView />
        </div>
    );
};

export default HomePane;
