// token鉴权模块
'use strict';
const configs = require('./config-box');

// 内存中要储存一些临时token，供游客使用
configs['temporary_tokens'] = new Object();
// 记录临时token的过期时间戳
configs['temporary_expire'] = new Object();
// 记录临时token的数量
configs['temporary_num'] = 0;

/**
 * 检验token是否有权限访问
 * @param {String} token token字符串 
 * @param {Array} reqPathParts 请求路径数组
 * @returns 布尔值
 */
module.exports = function (token, reqPathParts) {
    let tokenConfigs = configs.tokenConfigs, // 获取token配置
        tokens = tokenConfigs['tokens'], // 获取token列表
        target = null;
    for (let key in tokenConfigs['tokens']) {
        if (tokens[key] === token) { // 找到token
            target = key;
            break;
        }
    }
    if (!target) {
        return false;
    } else {
        let permissions = tokenConfigs['permissions'][target]; // 获取权限列表
        reqPathParts = reqPathParts.map(x => encodeURIComponent(x)); // 对路径进行编码
        for (let i = 0, len = permissions.length; i < len; i++) {
            let nodes = permissions[i].split('.'),
                // 比如server.*，则nodes为['server', '*'],通配符只能放在末尾
                challenge = nodes.every((node, ind) => {
                    return (node === '*' || !reqPathParts[ind] || node === reqPathParts[ind]);
                });
            if (challenge) {
                return true;
            }
        }
    }
    return false;
}