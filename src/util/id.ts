import bytesToBase64 from './bytes-to-b64';
import base64ToBytes from './b64-to-bytes';

const buf = new ArrayBuffer(15);
const bufView = new DataView(buf, 0, 6);
const lowBits = new Uint8Array(buf, 6);

/** Generate a 120-bit random ID. The top 48 bits are a timestamp, and the remaining 72 are a random value. */
export const generateID = (): string => {
    crypto.getRandomValues(lowBits);

    const now = Date.now();
    const nowLow = now >>> 0;
    const nowHigh = Math.floor(now / 4294967296);

    bufView.setUint16(0, nowHigh, false);
    bufView.setUint32(2, nowLow, false);

    return bytesToBase64(buf);
};

const timestampBuf = new Uint8Array(6);
const timestampView = new DataView(timestampBuf.buffer);
export const idToTimestamp = (id: string): number => {
    base64ToBytes(id.slice(0, 8), timestampBuf);
    const timeHigh = timestampView.getUint16(0, false);
    const timeLow = timestampView.getUint32(2, false);

    return (timeHigh * 4294967296) + timeLow;
};
