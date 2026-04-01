import {batch, computed, effect, signal, Signal} from '@preact/signals';
import {TextChangeEvent, TextHistory} from './text-history';
import {Tree, TreeFragment, Parser} from '@lezer/common';
import {SyntaxNodeCache, SyntaxNodeTransform} from '../util/syntax-node-cache';

/**
 * Create a signal that is updated with the incrementally-parsed version of the given input. Updates efficiently.
 * @param history The {@link TextHistory} to parse.
 * @param parser The parser to parse the history with.
 * @returns A signal which holds the raw document text and parsed syntax tree.
 */
const incrementalize = (history: Signal<TextHistory>, parser: Parser) => {
    const doc = signal('');
    const treeSignal = signal<{tree: Tree, fragments: readonly TreeFragment[]} | null>(null);

    let cleanup: (() => void) | null = null;

    effect(() => {
        if (cleanup) {
            cleanup();
        }
        const curHistory = history.value;
        const tree = parser.parse(curHistory.contents.peek());
        batch(() => {
            treeSignal.value = {tree, fragments: TreeFragment.addTree(tree)};
            doc.value = curHistory.contents.peek();
        });

        const listener = ({change}: TextChangeEvent) => {
            let {tree, fragments} = treeSignal.value!;

            fragments = TreeFragment.applyChanges(fragments, [{
                fromA: change.from,
                toA: change.to,
                fromB: change.from,
                toB: change.from + change.inserted.length
            }]);
            tree = parser.parse(curHistory.contents.peek(), fragments);
            fragments = TreeFragment.addTree(tree, fragments);

            batch(() => {
                treeSignal.value = {tree, fragments};
                doc.value = curHistory.contents.peek();
            });
        };

        cleanup = () => {
            curHistory.removeEventListener('textchange', listener);
        };

        curHistory.addEventListener('textchange', listener);
    });

    return computed(() => {
        return {
            doc: doc.value,
            tree: treeSignal.value!.tree
        };
    });
};

export default incrementalize;

export const incrementalizeCached = <T>(
    history: Signal<TextHistory>,
    parser: Parser,
    transform: SyntaxNodeTransform<T>
) => {
    const parsed = incrementalize(history, parser);
    const cache = new SyntaxNodeCache();
    return computed(() => cache.mapNodes(parsed.value.tree, parsed.value.doc, transform));
};
