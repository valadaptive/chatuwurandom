// eslint-disable-next-line @typescript-eslint/no-explicit-any
const throttle = <F extends (...args: any[]) => void>(fn: F, delay: number):
((...args: Parameters<F>) => void) & {cancel: () => void} => {
    let timeout: number | undefined;

    let lastExecutionTime = 0;
    const throttle = (...args: Parameters<F>) => {
        if (typeof timeout === 'number') {
            window.clearTimeout(timeout);
        }

        const now = Date.now();
        const run = () => {
            fn(...args);

            lastExecutionTime = now;
        };

        if (now - lastExecutionTime >= delay) {
            run();
        } else {
            timeout = window.setTimeout(run, delay);
        }
    };

    throttle.cancel = () => {
        if (typeof timeout === 'number') {
            window.clearTimeout(timeout);
        }
    };

    return throttle;
};

export default throttle;
