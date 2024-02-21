import './fonts.css';
import './global.scss';
import './css/buttons.scss';

import 'preact/debug';
import {render} from 'preact';

import {AppContext, createStore} from './app-state';
import {ControllerContext} from './controller/context';

import App from './components/App/App';
import Controller from './controller/controller';
import {OverlayProvider} from './components/Overlay/Overlay';
import {ToastProvider} from './components/Toast/Toast';

const store = createStore();
const controller = new Controller(store);

render((
    <ControllerContext.Provider value={controller}>
        <AppContext.Provider value={store}>
            <OverlayProvider>
                <ToastProvider>
                    <App />
                </ToastProvider>
            </OverlayProvider>
        </AppContext.Provider>
    </ControllerContext.Provider>
), document.body);
