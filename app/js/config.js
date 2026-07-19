/** 行程生成平台 · 配置（独立于云南页面） */

// 生产默认云端；本地开发由 dev server 在 HTML 注入 window.__TRAVEL_API_BASE__ 覆盖。
// 本地静态模式（npx serve / dev-local.sh yn|app）按 hostname 自动切到本地 func，
// 无需改本文件。如需临时指向其他后端，访问 ?api=<url> 即可（不持久化）。
const CLOUD_API = 'https://func-yntravel-ue8266.azurewebsites.net/api';
const LOCAL_API = 'http://localhost:7071/api';

const RUNTIME_BASE =
  (typeof window !== 'undefined' && window.__TRAVEL_API_BASE__) || '';

const QS_API =
  typeof window !== 'undefined' && new URLSearchParams(location.search).get('api');

const isLocal =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname);

export const API_BASE =
  RUNTIME_BASE || QS_API || (isLocal ? LOCAL_API : CLOUD_API);
export const RECENT_KEY = 'trip-platform-recent-v1';
