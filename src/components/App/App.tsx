import {useAppState, useAction, AppContext} from '../../app-state';

const App = () => {
    const appState = useAppState();
    return (
        <>Hello World!</>
    );
};

export default App;
