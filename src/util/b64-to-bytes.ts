const lookup: number[] = [];
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (let i = 0; i < alphabet.length; i++) {
    lookup[alphabet.charCodeAt(i)] = i;
}

const countPadding = (b64: string) => {
    let endPadding = 0;
    for (let i = b64.length - 1; i > b64.length - 3; i--, endPadding++) {
        if (b64[i] !== '=') break;
    }
    return endPadding;
};

export const base64ByteLength = (b64: string) => (b64.length * 3 / 4) - countPadding(b64);

const base64ToBytes = (b64: string, dst: Uint8Array) => {
    const len = base64ByteLength(b64);
    const padding = countPadding(b64);
    const unpaddedLen = b64.length - padding;

    let i = 0, byte = 0;
    for (; i + 3 < unpaddedLen && byte + 2 < len; i += 4, byte += 3) {
        const num = (lookup[b64.charCodeAt(i)] << 18) |
            (lookup[b64.charCodeAt(i + 1)] << 12) |
            (lookup[b64.charCodeAt(i + 2)] << 6) |
            lookup[b64.charCodeAt(i + 3)];

        dst[byte] = (num >> 16) & 0xff;
        dst[byte + 1] = (num >> 8) & 0xff;
        dst[byte + 2] = num & 0xff;
    }

    if (byte >= len) {
        return len;
    }

    switch (padding) {
        case 1: {
            const num = (lookup[b64.charCodeAt(i)] << 10) |
                (lookup[b64.charCodeAt(i + 1)] << 4) |
                (lookup[b64.charCodeAt(i + 2)] >> 2);
            dst[byte++] = (num >> 8) & 0xff;
            dst[byte++] = num & 0xff;
            break;
        }
        case 2: {
            const num = (lookup[b64.charCodeAt(i)] << 2) |
                (lookup[b64.charCodeAt(i + 1)] >> 4);
            dst[byte++] = num & 0xff;
            break;
        }
    }

    return len;
};

export default base64ToBytes;
