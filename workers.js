const SEND_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=b7a73d1c-9350-4500-adc2-d99a14d69b76';
const UPLOAD_BASE = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=b7a73d1c-9350-4500-adc2-d99a14d69b76';

const MAX_TIME_DIFF = 300;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Timestamp, X-Signature, X-File-Size',
  'Access-Control-Max-Age': '86400'
};

// 生成 HMAC-SHA256 签名
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

// 验证请求，返回 { valid: boolean, reason?: string }
async function verifyRequest(request, secret, contentType) {
  const ts = request.headers.get('X-Timestamp');
  const signature = request.headers.get('X-Signature');
  if (!ts || !signature) return { valid: false, reason: '缺少 X-Timestamp 或 X-Signature 头' };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts)) > MAX_TIME_DIFF) {
    return { valid: false, reason: `时间戳无效（服务器时间 ${now}，客户端时间 ${ts}）` };
  }

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
  if (signature !== expectedSig) {
    return { valid: false, reason: '签名不匹配' };
  }

  return { valid: true };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 从环境变量读取密钥（若未设置环境变量则使用硬编码作为 fallback，方便调试）
    const secret = env.SHARED_SECRET || 'My$ecr3tK3y!2024';

    const contentType = request.headers.get('Content-Type') || '';
    const verification = await verifyRequest(request, secret, contentType);
    if (!verification.valid) {
      return new Response(`401 Unauthorized: ${verification.reason}`, {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' }
      });
    }

    // 转发到企业微信 Webhook
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

    // 上传文件到企业微信
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
