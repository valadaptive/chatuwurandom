import './fonts.css';
import './global.scss';
import './css/buttons.scss';

import {render} from 'preact';

import {AppContext, createStore} from './app-state';

import App from './components/App/App';

const store = createStore();

render(<AppContext.Provider value={store}>
    <App />
</AppContext.Provider>, document.body);
