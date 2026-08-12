import CryptoJS from 'crypto-js';

const SECRET = 'izMNRXR9Cx96fTiE';

export function aesEncrypt(plaintext: string): string {
  const data = CryptoJS.enc.Utf8.parse(plaintext);
  const key = CryptoJS.enc.Utf8.parse(SECRET);
  const iv = CryptoJS.enc.Utf8.parse(SECRET);
  const encrypted = CryptoJS.AES.encrypt(data, key, { iv, mode: CryptoJS.mode.CBC });
  return CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
}

export function aesDecrypt(ciphertext: string): string {
  const key = CryptoJS.enc.Utf8.parse(SECRET);
  const iv = CryptoJS.enc.Utf8.parse(SECRET);
  const decrypted = CryptoJS.AES.decrypt(ciphertext, key, { iv, mode: CryptoJS.mode.CBC });
  return decrypted.toString(CryptoJS.enc.Utf8);
}
