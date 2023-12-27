import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import Controller from './controller';

export const ControllerContext = createContext<Controller | undefined>(undefined);

export const useController = (): Controller => {
    const context = useContext(ControllerContext);
    if (!context) throw new Error('No Controller provided');
    return context;
};
