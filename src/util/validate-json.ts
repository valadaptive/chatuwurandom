export type Schema =
| {
    type: 'object',
    properties: {[x: string]: Schema},
    partial?: boolean
}
| {
    type: 'array',
    elements: Schema
}
| {
    type: 'string',
    validValues?: string[]
}
| {type: 'number' | 'boolean' | 'null' | 'undefined'}
| 'string' | 'number' | 'boolean' | 'null' | 'undefined'
| Schema[];

type StringSchemaToObject<S extends {type: 'string', validValues?: string[]}> =
    S['validValues'] extends string[] ? S['validValues'][number] :
        string;

type SingleSchemaToObject<S extends Exclude<Schema, Schema[]>> =
    S extends {type: 'array', elements: infer Elements extends Schema} ?
        (SchemaToObject<Elements>)[] :
        S extends {type: 'object', properties: infer Props extends {[x: string]: Schema}} ?
            (S extends {partial: true} ?
                {[K in keyof Props]?: SchemaToObject<Props[K]>} :
                {[K in keyof Props]: SchemaToObject<Props[K]>}) :
            S extends {type: 'string', validValues?: string[]} ? StringSchemaToObject<S> :
                S extends 'string' ? string :
                    S extends {type: 'number'} | 'number' ? number :
                        S extends {type: 'boolean'} | 'boolean' ? boolean :
                            S extends {type: 'null'} | 'null' ? null :
                                S extends {type: 'undefined'} | 'undefined' ? undefined :
                                    never;

export type SchemaToObject<S extends Schema> =
    S extends Schema[] ?
        SchemaToObject<S[number]> :
        S extends Exclude<Schema, Schema[]> ? SingleSchemaToObject<S> : never;

const jsonMatchesSingle = <S extends Exclude<Schema, Schema[]>>(
    schema: S,
    json: unknown
): json is SchemaToObject<S> => {
    const schemaType = typeof schema === 'string' ?
        schema as 'string' | 'number' | 'boolean' | 'null' | 'undefined' :
        schema.type;
    switch (schemaType) {
        case 'object': {
            if (typeof json !== 'object' || json === null || Array.isArray(json)) return false;
            const isPartial = (schema as {partial?: boolean}).partial;

            if (typeof schema !== 'object' || !('properties' in schema)) throw new Error('unreachable');
            for (const schemaKey of Object.keys(schema.properties)) {
                const jsonValue = (json as Record<string, unknown>)[schemaKey];
                // Needed to avoid infinite type instantiation
                const uncheckedValue = jsonValue;
                if (!jsonMatchesSchema(schema.properties[schemaKey], jsonValue)) {
                    if (typeof uncheckedValue === 'undefined' && isPartial) continue;
                    return false;
                }
            }

            return true;
        }
        case 'array': {
            if (!Array.isArray(json)) return false;

            for (const elem of json) {
                if (!jsonMatchesSchema(schema, elem)) return false;
            }

            return true;
        }
        case 'string': return typeof json === 'string';
        case 'number': return typeof json === 'number';
        case 'boolean': return typeof json === 'boolean';
        case 'null': return json === null;
        case 'undefined': return typeof json === 'undefined';
    }
};

/**
 * Check if a given unknown object conforms to the object schema passed in. This is a type assertion function, so by
 * using it as a guard clause, you can safely operate on the object which will now be of the type defined in the schema.
 * @param schema The object schema that the unknown object should conform to.
 * @param json The unknown object (probably from deserializing JSON) that should be validated.
 * @returns True if the object conforms to the schema, false if not.
 */
export const jsonMatchesSchema = <S extends Schema>(schema: S, json: unknown): json is SchemaToObject<S> => {
    if (Array.isArray(schema)) {
        for (const subschema of schema) {
            if (jsonMatchesSingle(subschema, json)) {
                return true;
            }
        }
        return false;
    }

    return jsonMatchesSingle(schema, json);
};
