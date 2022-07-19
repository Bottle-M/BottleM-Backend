// token鉴权模块
'use strict';
const path = require('path');
const configs = require(path.join(__dirname, './config-box'));

/**
 * 检验token是否有权限访问
 * @param {*} token token字符串 
 * @param {*} reqPath 请求路径数组
 * @returns 布尔值
 */
module.exports = function (token, reqPath) {
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
        for (let i = 0, len = permissions.length; i < len; i++) {
            let nodes = permissions[i].split('.'), // 比如server.*
                challenge = nodes.every((node, ind) => {
                    return (node === '*' || node === reqPath[ind]);
                });
            if (challenge) {
                return true;
            }
        }
    }
    return false;
}