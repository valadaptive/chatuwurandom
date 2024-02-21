import style from './style.scss';

import type {JSX} from 'preact';
import classNames from 'classnames';

import {Motif} from '../../util/motif';

export type IconType =
    | 'arrow-down'
    | 'arrow-right'
    | 'cancel'
    | 'check'
    | 'close'
    | 'edit'
    | 'error'
    | 'export'
    | 'file'
    | 'folder'
    | 'plus'
    | 'undo'
    | 'redo'
    | 'retry'
    | 'send'
    | 'warning';

const Icon = ({type, title, size, onClick, disabled, motif, className}: {
    type: IconType,
    title: string,
    size?: string | number,
    onClick?: () => unknown,
    disabled?: boolean,
    motif?: Motif,
    className?: string
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
                    [style.disabled]: disabled,
                    [style.motifPrimary]: motif === Motif.PRIMARY,
                    [style.motifSuccess]: motif === Motif.SUCCESS,
                    [style.motifWarning]: motif === Motif.WARNING,
                    [style.motifError]: motif === Motif.ERROR,
                    [style.motifMonochrome]: motif === Motif.MONOCHROME
                },
                className
            )}
            style={inlineStyle}
            onClick={disabled ? undefined : onClick}
            title={title}
        />
    );
};

export default Icon;
