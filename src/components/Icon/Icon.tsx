import style from './style.module.scss';

import type {JSX} from 'preact';

export type IconType = 'attach' | 'cancel' | 'close' | 'send';

const Icon = ({type, title, onClick, disabled}: {
    type: IconType,
    title: string,
    onClick?: () => unknown,
    disabled?: boolean,
}): JSX.Element => {
    const classes = [style.icon, style[type]];
    if (onClick) classes.push(style.button);
    if (disabled) classes.push(style.disabled);

    return (
        <div
            className={classes.join(' ')}
            onClick={disabled ? undefined : onClick}
            title={title}
        />
    );
};

export default Icon;
