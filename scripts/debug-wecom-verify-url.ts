/**
 * Generate a GET URL that mimics WeCom "verify callback URL" (echostr flow).
 * Use while AionUi WebUI is running and the WeCom channel plugin is enabled.
 *
 * Usage:
 *   bunx tsx scripts/debug-wecom-verify-url.ts \
 *     --base http://127.0.0.1:25808 \
 *     --token YOUR_TOKEN \
 *     --aes YOUR_43_CHAR_ENCODING_AES_KEY
 *
 * Then curl the printed URL; response body should equal the plaintext (default: aionui-wecom-verify-ok).
 */

import { encryptPayload, sha1Sign } from '../src/process/channels/plugins/wecom/WecomCrypto';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base' && argv[i + 1]) {
      out.base = argv[++i];
    } else if (a === '--token' && argv[i + 1]) {
      out.token = argv[++i];
    } else if (a === '--aes' && argv[i + 1]) {
      out.aes = argv[++i];
    } else if (a === '--plain' && argv[i + 1]) {
      out.plain = argv[++i];
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv);
  const base = (args.base || 'http://127.0.0.1:25808').replace(/\/+$/, '');
  const token = args.token || '';
  const aes = args.aes || '';
  const plain = args.plain || 'aionui-wecom-verify-ok';

  if (!token || !aes) {
    console.error('Missing --token or --aes');
    console.error('');
    console.error(
      'Example:\n  bunx tsx scripts/debug-wecom-verify-url.ts --base http://127.0.0.1:25808 --token YOUR_TOKEN --aes YOUR_43_CHAR_KEY'
    );
    process.exit(1);
  }
  if (aes.length !== 43) {
    console.error(`EncodingAESKey must be 43 characters, got ${aes.length}`);
    process.exit(1);
  }

  const echostr = encryptPayload(aes, plain);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = Math.random().toString(36).slice(2, 12);
  const msgSignature = sha1Sign(token, timestamp, nonce, echostr);

  const path = '/channels/wecom/webhook';
  const q = new URLSearchParams({
    msg_signature: msgSignature,
    timestamp,
    nonce,
    echostr,
  });
  const url = `${base}${path}?${q.toString()}`;

  console.log('Expected response body (plaintext):');
  console.log(plain);
  console.log('');
  console.log('GET URL (copy or curl -g):');
  console.log(url);
  console.log('');
  console.log('Quick test:');
  console.log(`curl -g -sS "${url.replace(/"/g, '\\"')}"`);
}

main();
