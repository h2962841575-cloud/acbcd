const SEND_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=b7a73d1c-9350-4500-adc2-d99a14d69b76';
const UPLOAD_BASE = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=b7a73d1c-9350-4500-adc2-d99a14d69b76';

const MAX_TIME_DIFF = 300;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Timestamp, X-Signature, X-File-Size',
  'Access-Control-Max-Age': '86400'
};

async function generateSignature(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
}

async function verifyRequest(request, secret, contentType) {
  const ts = request.headers.get('X-Timestamp');
  const signature = request.headers.get('X-Signature');
  if (!ts || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts)) > MAX_TIME_DIFF) return false;

  let message = ts + ':';
  if (contentType && contentType.includes('multipart/form-data')) {
    const fileSize = request.headers.get('X-File-Size') || '0';
    message += fileSize;
  } else {
    const clone = request.clone();
    const body = await clone.text();
    message += body;
  }

  const expectedSig = await generateSignature(message, secret);
  return signature === expectedSig;
}

export default {
  async fetch(request, env) {  // env 对象包含环境变量
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const contentType = request.headers.get('Content-Type') || '';
    const secret = env.SHARED_SECRET;  // 从环境变量读取密钥

    if (!await verifyRequest(request, secret, contentType)) {
      return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
    }

    // ... 后面的 send 和 upload 逻辑保持不变
  }
};
