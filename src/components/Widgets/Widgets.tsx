import style from './style.scss';
import slider from './slider.scss';

import type {JSX} from 'preact';
import {useCallback, useEffect, useId, useLayoutEffect, useRef} from 'preact/hooks';
import type {Signal} from '@preact/signals';
import classNames from 'classnames';

export const Dropdown = <T extends string | number>({value, options, className}: {
    value: Signal<T>,
    options: {
        id: T,
        name: string
    }[],
    className?: string
}): JSX.Element => {
    const handleChange = useCallback((event: Event) => {
        const select = event.target as HTMLSelectElement;
        if (select.selectedIndex > 0) {
            value.value = options[select.selectedIndex].id;
        }
    }, [value, options]);

    return (
        <div className={classNames(style.selectWrapper, className)}>
            <select className={style.select}>
                {options.map(({id, name}) => (
                    <option value={id} key={id} selected={id === value.value} onChange={handleChange}>{name}</option>
                ))}
            </select>
        </div>
    );
};

export const SpinBox = ({value, min, max, step = 1, className}: {
    value: Signal<number>,
    min: number,
    max: number,
    step?: number | 'any',
    className?: string
}): JSX.Element => {
    const handleInput = useCallback((event: Event) => {
        const newValue = Number((event.target as HTMLInputElement).value);
        value.value = newValue;
    }, [value]);

    const increment = useCallback(() => {
        value.value = Math.min(value.value + (step === 'any' ? 1 : step), max);
    }, [value, step]);

    const decrement = useCallback(() => {
        value.value = Math.max(value.value - (step === 'any' ? 1 : step), min);
    }, [value, step]);

    const spinboxId = useId();

    const pointerListeners = useRef<{
        move:(event: PointerEvent) => unknown,
        up:(event: PointerEvent) => unknown
    } | null>(null);
    useEffect(() => {
        if (pointerListeners.current) {
            window.removeEventListener('pointermove', pointerListeners.current.move);
            window.removeEventListener('pointerup', pointerListeners.current.up);
        }
    }, []);

    // Drag up/down to change the value
    const deadZone = useRef({bottom: 0, top: 0});
    const valueStart = useRef(0);
    const handlePointerDown = useCallback((event: PointerEvent) => {
        // Don't count up/down drags if the cursor is inside the spinbox
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        deadZone.current = {bottom: rect.bottom, top: rect.top};
        valueStart.current = value.value;

        const onMove = (event: PointerEvent) => {
            // Not sure if this stops drag-to-scroll. I sure hope it does!
            event.preventDefault();

            let mouseDelta = 0;
            if (event.clientY < deadZone.current.top) {
                mouseDelta = event.clientY - deadZone.current.top;
            } else if (event.clientY > deadZone.current.bottom) {
                mouseDelta = event.clientY - deadZone.current.bottom;
            }
            // 200px (in either direction; it's the "radius", not "diameter") for the slider to go from min to max
            const valueDelta = mouseDelta * (max - min) / 200;

            const clampedValue = Math.max(min, Math.min(valueStart.current - valueDelta, max));
            const roundedValue = step === 'any' ? clampedValue : Math.round(clampedValue / step) * step;
            value.value = roundedValue;
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        pointerListeners.current = {move: onMove, up: onUp};

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, []);

    return (
        <div className={classNames(style.spinboxWrapper, className)}>
            <input
                className={style.spinbox}
                type="number"
                min={min}
                max={max}
                step={step}
                value={Number(value.value.toFixed(12))}
                onInput={handleInput}
                id={spinboxId}
                onPointerDown={handlePointerDown}
            />
            <div className={style.spinboxButtons}>
                <div onClick={increment} className={style.spinboxButton} role="button" aria-controls={spinboxId}>
                    <div className={style.spinboxUp} />
                </div>
                <div className={style.spinboxButtonDivider} />
                <div onClick={decrement} className={style.spinboxButton} role="button" aria-controls={spinboxId}>
                    <div className={style.spinboxDown} />
                </div>
            </div>
        </div>
    );
};

export const Slider = ({value, min, max, step = 1, className}: {
    value: Signal<number>,
    min: number,
    max: number,
    step?: number | 'any',
    className?: string
}): JSX.Element => {
    const sliderInput = useRef<HTMLInputElement>(null);
    const handleInput = useCallback((event: Event) => {
        const newValue = Number((event.target as HTMLInputElement).value);
        value.value = newValue;
    }, [value]);

    useLayoutEffect(() => {
        const slider = sliderInput.current!;
        slider.style.setProperty('--min', String(min));
        slider.style.setProperty('--max', String(max));
        slider.style.setProperty('--val', String(value.value));
    }, [value.value, min, max]);

    return (
        <input
            className={classNames(slider.slider, className)}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value.value}
            onInput={handleInput}
            ref={sliderInput}
        />
    );
};
