type ForceInvariance<B> = Change extends B ? never : B;

export interface ChangeConstructor<InstanceType extends Change> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (...args: any[]): ForceInvariance<InstanceType>;
    merge (a: ForceInvariance<InstanceType>, b: ForceInvariance<InstanceType>): ForceInvariance<InstanceType> | null;
}

export interface Change {
    readonly id: string;
    readonly inverseOf?: string;

    invert(): ThisType<this>
}

/* This is an example of the proper way to enforce static method types so that merge() has to return the specific
 * subtype and not just Change.

export const doSomethingWithChange = <T extends Change>(meta: ChangeConstructor<T>) => {
    // TODO
};
*/
