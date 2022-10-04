// token鉴权模块
'use strict';
const { randStr } = require('./tools');
const configs = require('./config-box');
const USER_TOKENS = configs['userTokens'];
const TOKEN_CONFIGS = configs['apiConfigs']['tokens'];
// 在内存中储存所有token
const ALL_TOKENS = Object.assign({}, USER_TOKENS['tokens']);
// 所有token对应的权限
const TOKEN_PERMISSIONS = Object.assign({}, USER_TOKENS['permissions']);
// 记录临时token的过期时间戳
const TEMP_TOKEN_EXPIRE_TIMES = new Array();
// 记录临时token的数量
var TEMPORARY_TOKEN_NUM = 0;

// 临时token检查器(每5秒检查一次)
setInterval(() => {
    for (let i = 0, len = TEMP_TOKEN_EXPIRE_TIMES.length; i < len; i++) {
        let [key, expireTime] = TEMP_TOKEN_EXPIRE_TIMES[i];
        if (Date.now() >= expireTime) {
            // token过期，移除
            delete ALL_TOKENS[key];
            delete TOKEN_PERMISSIONS[key];
            TEMP_TOKEN_EXPIRE_TIMES.splice(i, 1);
            i--;
            len--;
            TEMPORARY_TOKEN_NUM--;
        }
    }
}, 5000);

module.exports = {
    /**
     * 检验token是否有权限访问
     * @param {String} token token字符串 
     * @param {Array} reqPathParts 请求路径数组
     * @returns 布尔值
     */
    auther: function (token, reqPathParts) {
        let target = null;
        for (let key in ALL_TOKENS) {
            if (ALL_TOKENS[key] === token) { // 找到token
                target = key;
                break;
            }
        }
        if (!target) {
            return false;
        } else {
            const permissions = TOKEN_PERMISSIONS[target]; // 获取权限列表
            // 对路径进行编码后连接起来
            const reqPath = reqPathParts.map(x => encodeURIComponent(x)).join('.');
            for (let i = 0, len = permissions.length; i < len; i++) {
                // 构造正则表达式
                let reg = new RegExp('^' + permissions[i].replaceAll('.', '\\.').replaceAll('*', '.*') + '$');
                if (reg.test(reqPath)) { // 匹配成功
                    return true;
                }
            }
        }
        return false;
    },
    /**
     * 生成一个供游客使用的临时token
     * @param {Number} validity 有效期(毫秒)，未指定则使用默认值(配置的default_validity)
     * @return {Array} [token,expiry,msg]，失败了的话token为null
     */
    genTempToken: function (validity = 0) {
        if (TEMPORARY_TOKEN_NUM >= TOKEN_CONFIGS['max_temp_tokens_num']) {
            return [null, null, 'Max temp tokens num exceeded.'];
        }
        if (!validity || typeof validity !== 'number')
            validity = TOKEN_CONFIGS['default_validity'];
        const tempToken = randStr(64); // 生成64位随机字符串作为token
        const currentTime = Date.now();
        const expiry = currentTime + Number(validity);
        let tempKey = `temp${currentTime}`; // 生成一个临时键名
        ALL_TOKENS[tempKey] = tempToken; // 将token存入临时token列表
        // 记录临时token的权限
        TOKEN_PERMISSIONS[tempKey] = TOKEN_CONFIGS['temp_permissions'];
        // 将过期时间戳存入过期时间列表
        TEMP_TOKEN_EXPIRE_TIMES.push([tempKey, expiry]);
        TEMPORARY_TOKEN_NUM++;
        return [tempToken, expiry, 'ok'];
    }
}