/**
 * 全局配置与常量。
 */

// ☁️ 云端后端 API（Azure Functions）
// 默认指向云端；本地静态模式（npx serve / dev-local.sh yn|app）按 hostname 自动切到本地 func，
// 无需改本文件。proxy 模式由 .tmp-local-dev-server.mjs 在 HTML 注入 window.__TRAVEL_API_BASE__。
// 如需临时指向其他后端，访问 ?api=<url> 即可（不持久化）。
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

// 本地缓存 key（离线兜底）
export const STORE_KEY = 'yn-travel-v1';

// 花销登记的固定成员及头像
export const PEOPLE = ['Wenwen', 'Kun', 'Yiming', 'Jun'];
export const PERSON_ICON = {
  Wenwen: 'woman.png',
  Yiming: 'woman.png',
  Kun: 'man.png',
  Jun: 'man.png',
};

// 图片上传前压缩参数
export const IMAGE_MAX_DIM = 1000;
export const IMAGE_QUALITY = 0.7;

// 自动同步轮询间隔（毫秒）
export const SYNC_INTERVAL_MS = 30000;

// 花销时间轴渲染参数
export const EXPENSE_AXIS = { height: 560, top: 10, ticks: 6 };
