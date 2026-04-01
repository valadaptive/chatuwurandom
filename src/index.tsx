import './assets/fonts/fonts.css';
import './global.scss';

import {render} from 'preact';

import {AppContext, createStore} from './app-state';
import {ControllerContext} from './controller/context';

import App from './components/App/App';
import Controller from './controller/controller';

const store = createStore();
const controller = new Controller(store);

render((
    <ControllerContext.Provider value={controller}>
        <AppContext.Provider value={store}>
            <App />
        </AppContext.Provider>
    </ControllerContext.Provider>
), document.body);
