// WebSocket接受数据处理
'use strict';

const utils = require('./server-utils');

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
    }
}