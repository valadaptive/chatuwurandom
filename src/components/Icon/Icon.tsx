import style from './style.scss';

import type {JSX} from 'preact';
import classNames from 'classnames';

type IconType = 'arrow-down' | 'arrow-right' | 'cancel' | 'undo' | 'redo' | 'retry' | 'send';

const Icon = ({type, title, size, onClick, disabled}: {
    type: IconType,
    title: string,
    size?: string | number,
    onClick?: () => unknown,
    disabled?: boolean
}): JSX.Element => {
    const cssSize = typeof size === 'string' ? size : typeof size === 'number' ? `${size}px` : undefined;
    const inlineStyle = cssSize ? {
        width: cssSize,
        height: cssSize
    } : undefined;
    return (
        <div
            className={classNames(
                style.icon,
                style[type],
                {
                    [style.button]: onClick,
                    [style.disabled]: disabled
                }
            )}
            style={inlineStyle}
            onClick={disabled ? undefined : onClick}
            title={title}
        />
    );
};

export default Icon;
