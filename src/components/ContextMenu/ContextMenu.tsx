import style from './style.scss';

import {Signal} from '@preact/signals';
import {useCallback, useContext} from 'preact/hooks';
import {ComponentChildren, RefObject, createContext, VNode} from 'preact';
import {shift, flip, offset} from '@floating-ui/dom';

import Icon, {IconType} from '../Icon/Icon';
import {Overlay} from '../Overlay/Overlay';

import useFloating from '../../hooks/floating';
import classNames from 'classnames';

const MenuContext = createContext<{closeMenu:() => void} | undefined>(undefined);

const ContextMenu = ({children, relativeTo, active}: {
    children?:ComponentChildren,
    relativeTo: RefObject<HTMLElement>,
    active: Signal<boolean>
}) => {
    const {reference, floating} = useFloating(() => ({
        middleware: [
            offset(4),
            shift(),
            flip()
        ]
    }));
    reference(relativeTo.current);

    const menuRef = (elem: HTMLDivElement | null) => {
        floating(elem);
        elem?.focus();
    };

    const handleBlur = useCallback((event: FocusEvent) => {
        // The click happened inside the menu. Don't disappear.
        if (event.relatedTarget) return;
        active.value = false;
    }, [active]);

    const handleClick = useCallback((event: Event) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const closeMenu = useCallback(() => {
        active.value = false;
    }, [active]);

    if (!active.value) return null;

    return (
        <Overlay>
            <MenuContext.Provider value={{closeMenu}}>
                <div className={style.menu} tabIndex={0} ref={menuRef} onBlur={handleBlur} onClick={handleClick}>
                    {children}
                </div>
            </MenuContext.Provider>
        </Overlay>

    );
};

type MenuItemProps<T> = {
    value: T,
    children?: ComponentChildren,
    onClick?: (value: T) => void,
    icon?: IconType
};

export const Item = <T, >({value, children, onClick, icon}: MenuItemProps<T>): VNode<MenuItemProps<T>> => {
    const menuContext = useContext(MenuContext);
    if (!menuContext) throw new Error('The Item component can only be used inside a ContextMenu component.');

    const handleClick = useCallback(() => {
        onClick?.(value);
        menuContext.closeMenu();
    }, [value, menuContext]);

    return (
        <div className={classNames(style.item, icon && style.withIcon)} onClick={handleClick}>
            {icon ? <Icon type={icon} title='' className={style.itemIcon} /> : null}
            {children}
        </div>
    );
};

export default ContextMenu;
