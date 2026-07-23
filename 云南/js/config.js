/**
 * 全局配置与常量。
 */

// ☁️ 云端后端 API（Azure Functions）
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
export const APP_ENV = LOCAL_HOSTS.has(location.hostname) ? 'local' : 'production';
export const API_BASE = APP_ENV === 'local'
  ? 'http://localhost:7071/api'
  : 'https://func-yntravel-ue8266.azurewebsites.net/api';

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
