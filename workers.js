const SEND_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=b7a73d1c-9350-4500-adc2-d99a14d69b76';
const UPLOAD_BASE = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=b7a73d1c-9350-4500-adc2-d99a14d69b76';

// ========== 安全配置 ==========
const SHARED_SECRET = 'My$ecr3tK3y!2024'; // 改为你自己的随机密钥（与前端一致）
const MAX_TIME_DIFF = 300; // 时间戳允许误差(秒)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Timestamp, X-Signature, X-File-Size',
  'Access-Control-Max-Age': '86400'
};

async function generateSignature(message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SHARED_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
}

async function verifyRequest(request, contentType) {
  const ts = request.headers.get('X-Timestamp');
  const signature = request.headers.get('X-Signature');
  if (!ts || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts)) > MAX_TIME_DIFF) return false;

  let message = ts + ':';
  if (contentType && contentType.includes('multipart/form-data')) {
    // 上传文件时：签名消息为 时间戳 + 文件大小
    const fileSize = request.headers.get('X-File-Size') || '0';
    message += fileSize;
  } else {
    // 普通请求：签名消息为 时间戳 + 请求体
    const clone = request.clone();
    const body = await clone.text();
    message += body;
  }

  const expectedSig = await generateSignature(message);
  return signature === expectedSig;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!await verifyRequest(request, contentType)) {
      return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
    }

    if (path === '/send') {
      const resp = await fetch(SEND_URL, {
        method: 'POST',
        headers: request.headers,
        body: request.body
      });
      const data = await resp.text();
      return new Response(data, {
        status: resp.status,
        headers: { ...Object.fromEntries(resp.headers), ...CORS_HEADERS }
      });
    }

    if (path === '/upload') {
      const type = url.searchParams.get('type') || 'file';
      const uploadUrl = UPLOAD_BASE + '&type=' + encodeURIComponent(type);

      const bodyBuffer = await request.arrayBuffer();
      const newHeaders = new Headers(request.headers);
      newHeaders.set('Content-Length', bodyBuffer.byteLength);
      newHeaders.delete('host');
      newHeaders.delete('connection');

      const newRequest = new Request(uploadUrl, {
        method: 'POST',
        headers: newHeaders,
        body: bodyBuffer
      });

      const resp = await fetch(newRequest);
      const data = await resp.text();
      return new Response(data, {
        status: resp.status,
        headers: { ...Object.fromEntries(resp.headers), ...CORS_HEADERS }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};
