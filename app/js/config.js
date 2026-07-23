/** 行程生成平台 · 配置（独立于云南页面） */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
export const APP_ENV = LOCAL_HOSTS.has(location.hostname) ? 'local' : 'production';
export const API_BASE = APP_ENV === 'local'
	? 'http://localhost:7071/api'
	: 'https://func-yntravel-ue8266.azurewebsites.net/api';
export const RECENT_KEY = 'trip-platform-recent-v1';
