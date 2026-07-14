const SEND_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=b7a73d1c-9350-4500-adc2-d99a14d69b76';
const UPLOAD_BASE = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=b7a73d1c-9350-4500-adc2-d99a14d69b76';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 发送消息（JSON，保持不变）
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

    // 上传文件 —— 关键修复
    if (path === '/upload') {
      const type = url.searchParams.get('type') || 'file';
      const uploadUrl = UPLOAD_BASE + '&type=' + encodeURIComponent(type);

      // 1. 完整读取请求体（二进制）
      const bodyBuffer = await request.arrayBuffer();

      // 2. 复制请求头，并强制添加 Content-Length
      const newHeaders = new Headers(request.headers);
      newHeaders.set('Content-Length', bodyBuffer.byteLength);
      // 删除可能干扰的头部
      newHeaders.delete('host');
      newHeaders.delete('connection');
      // 注意：绝对不能删除 Content-Type，它包含了 boundary！

      // 3. 构造新请求
      const newRequest = new Request(uploadUrl, {
        method: 'POST',
        headers: newHeaders,
        body: bodyBuffer
      });

      // 4. 发送并返回企业微信响应
      const resp = await fetch(newRequest);
      const data = await resp.text();
      
      // 5. （可选）添加日志，便于调试
      console.log('Upload response:', data);
      
      return new Response(data, {
        status: resp.status,
        headers: { ...Object.fromEntries(resp.headers), ...CORS_HEADERS }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};
