import style from './style.scss';

import type {JSX, ComponentChildren} from 'preact';
import {Signal, useSignal} from '@preact/signals';
import {useCallback} from 'preact/hooks';
import classNames from 'classnames';

import Icon from '../Icon/Icon';
import {Dropdown, Slider, SpinBox} from '../Widgets/Widgets';

export const SettingsSection = ({name, children}: {name: string, children?: ComponentChildren}): JSX.Element => {
    const isOpen = useSignal(true);

    return (
        <div className={style.section}>
            <div className={style.sectionHeading} onClick={() => isOpen.value = !isOpen.value}>
                <Icon type={isOpen.value ? 'arrow-down' : 'arrow-right'} title={isOpen.value ? 'Collapse' : 'Expand'} />
                <div className={style.sectionName}>{name}</div>
            </div>
            <div className={classNames(style.sectionContents, {[style.closed]: !isOpen.value})}>
                {children}
            </div>
        </div>
    );
};

export const SettingRow = ({children}: {children?: ComponentChildren}): JSX.Element => {
    return (
        <div className={style.settingRow}>
            {children}
        </div>
    );
};

export const Setting = ({name, description, enabled, children}: {
    name: string,
    description?: string,
    enabled?: Signal<boolean>,
    children?: ComponentChildren
}): JSX.Element => {
    const handleInput = useCallback((event: Event) => {
        if (enabled) enabled.value = (event.target as HTMLInputElement).checked;
    }, [enabled]);

    return (
        <div className={style.setting}>
            {typeof enabled === 'undefined' ?
                <div className={style.settingName} title={description}>{name}</div> :
                <label title={description}>
                    <input type="checkbox" checked={enabled.value} onInput={handleInput} />
                    {name}
                </label>
            }
            {children}
        </div>
    );
};

export const RangeSetting = ({value, min, max, step = 1}: {
    value: Signal<number>,
    min: number,
    max: number,
    step?: number | 'any'
}): JSX.Element => {
    return (
        <SettingRow>
            <Slider
                className={style.rangeSlider}
                min={min}
                max={max}
                step={step}
                value={value}
            />
            <SpinBox
                min={min}
                max={max}
                step={step}
                value={value}
            />
        </SettingRow>
    );
};

export const TextSetting = ({value, onEnter}: {value: Signal<string>, onEnter?: () => unknown}): JSX.Element => {
    const handleInput = useCallback((event: Event) => {
        const newValue = (event.target as HTMLInputElement).value;
        value.value = newValue;
    }, [value]);

    const handleKeyPress = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Enter') {
            onEnter?.();
        }
    }, [onEnter]);

    return (
        <SettingRow>
            <input
                className={style.textbox}
                type='text'
                value={value.value}
                onInput={handleInput}
                onKeyPress={handleKeyPress}
            />
        </SettingRow>
    );
};

export const SelectSetting = <T extends string | number>({value, options}: {
    value: Signal<T>,
    options: {
        id: T,
        name: string
    }[]
}): JSX.Element => {
    return (
        <SettingRow>
            <Dropdown options={options} value={value} className={style.select} />
        </SettingRow>
    );
};
