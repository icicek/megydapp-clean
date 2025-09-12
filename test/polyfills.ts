// test/polyfills.ts

// TextEncoder / TextDecoder
import { TextEncoder, TextDecoder } from 'util';
(globalThis as any).TextEncoder = TextEncoder;
(globalThis as any).TextDecoder = TextDecoder as any;

// crypto.getRandomValues (Node 18/20'de var ama garantiye alalım)
import nodeCrypto from 'crypto';
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = nodeCrypto.webcrypto;
}

// atob / btoa (bazı sürümler istiyor)
if (!(globalThis as any).atob) {
  (globalThis as any).atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
}
if (!(globalThis as any).btoa) {
  (globalThis as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}
