/**
 * API 地址打码
 *   http://1.2.3.4:3300  -> http://***:3300
 *   https://api.example.com -> https://***.com
 *   http://1.2.3.4:3300/path -> http://***:3300/path
 */
export declare function maskApiBase(url: any): string;
/** 卡片 footer / hint 用：API · ***:3300 */
export declare function apiHintFor(): string;
