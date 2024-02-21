const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('');

const tripletToBase64 = (num: number) => {
    return alphabet[(num >> 18) & 0b111111] +
        alphabet[(num >> 12) & 0b111111] +
        alphabet[(num >> 6) & 0b111111] +
        alphabet[num & 0b111111];
};

const bytesToBase64 = (bytes: ArrayBuffer): string => {
    const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    let result = '';
    let i = 0;
    for (; i + 2 < arr.length; i += 3) {
        result += tripletToBase64(
            (arr[i] << 16) |
            (arr[i + 1] << 8) |
            arr[i + 2]
        );
    }
    switch (arr.length % 3) {
        case 1:
            result += alphabet[arr[i] >> 2] + alphabet[(arr[i] << 4) & 0b111111] + '==';
            break;
        case 2:
            result +=
                alphabet[arr[i] >> 2] +
                alphabet[(((arr[i] << 4) & 0b111111) | (arr[i + 1] >> 4))] +
                alphabet[(arr[i + 1] << 2) & 0b111111] +
                '=';
            break;

    }
    return result;
};

export default bytesToBase64;
