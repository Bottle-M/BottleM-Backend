// WebSocket接受数据处理
'use strict';

const utils = require('./server-utils');
const outputer = require('./../basic/output');

/**
 * 实例端WebSocket路由
 * @param {Object} recvObj 接收到的数据对象
 * @param {WebSocket} ws WebSocket实例
 */
module.exports = function (recvObj, ws) {
    let { action } = recvObj; // 获得实例端回应的动作
    switch (action) {
        case 'status_sync': // 同步状态信息
            let statusCode = recvObj['status_code']; // 获得状态代码
            if (statusCode > 2200) { // 状态码要大于2200才正常
                utils.setStatus(statusCode); // 设置状态码
            }
            break;
        case 'log_sync': // 同步一条日志
            {
                let { level, msg, time, error } = recvObj; // 获得日志数据
                if (!error) {
                    outputer(level, msg, true, time); // 输出日志
                } else {
                    utils.errorHandler(msg, time); // 发生错误，转到错误处理函数
                }
            }
            break;
    }
}