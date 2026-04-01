import {SyntaxNodeRef, Tree, TreeCursor} from '@lezer/common';

export type SyntaxNodeTransform<T> = (
    node: SyntaxNodeRef | string, children: T[] | null, doc: string, depth: number) => T;

export class SyntaxNodeCache {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private treeCache = new WeakMap<(...args: any[]) => unknown, WeakMap<Tree, unknown>>();

    constructor () {

    }

    mapNodes<T> (
        tree: Tree,
        doc: string,
        fn: SyntaxNodeTransform<T>) {
        let cacheMaybe = this.treeCache.get(fn) as WeakMap<Tree, T> | undefined;
        if (!cacheMaybe) {
            cacheMaybe = new WeakMap();
            this.treeCache.set(fn, cacheMaybe);
        }
        const cache = cacheMaybe;

        const traverse = (cursor: TreeCursor, depth: number): T => {
            const parentStart = cursor.from;
            if (!cursor.firstChild()) {
                if (cursor.node.tree) {
                    const memo = cache.get(cursor.node.tree);
                    if (memo) return memo;
                }

                const mapped = fn(cursor, null, doc, depth);
                if (cursor.node.tree) cache.set(cursor.node.tree, mapped);
                return mapped;
            }

            const children: T[] = [];
            let siblingPos = cursor.from;

            if (parentStart < siblingPos) {
                children.push(fn(doc.slice(parentStart, cursor.from), null, doc, depth + 1));
            }

            for (;;) {
                cursor.parent();
                const siblingFound = cursor.childAfter(siblingPos);
                if (!siblingFound) break;
                if (cursor.from > siblingPos) {
                    children.push(fn(doc.slice(siblingPos, cursor.from), null, doc, depth + 1));
                }

                siblingPos = cursor.to;
                children.push(traverse(cursor, depth + 1));
            }
            if (cursor.to > siblingPos) {
                children.push(fn(doc.slice(siblingPos, cursor.to), null, doc, depth + 1));
            }

            if (cursor.node.tree) {
                const memo = cache.get(cursor.node.tree);
                if (memo) return memo;
            }

            const mapped = fn(cursor, children, doc, depth);
            if (cursor.node.tree) cache.set(cursor.node.tree, mapped);

            return mapped;
        };

        const cursor = tree.cursorAt(0);

        return traverse(cursor, 0);
    }
}
