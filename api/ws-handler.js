// WebSocket接受数据处理
'use strict';

const utils = require('./server-utils');
const outputer = require('./../basic/output');
var dataSending = false; // 是否有正在发送的数据
var mainConnection = null; // 记录主WebSocket连接


/**
 * 通过主WebSocket发送数据，如果未发送成功会伺机重新发送
 * @param {Object} respObj 
 * @note https://github.com/websockets/ws/issues/999#issuecomment-279233272
 */
function send(respObj) {
    let timer = setInterval(() => {
        // 在主连接存活且没有正在发送数据的情况下，发送数据
        if (mainConnection && !dataSending) {
            dataSending = true;
            clearInterval(timer);
            mainConnection.send(JSON.stringify(respObj), (err) => {
                dataSending = false; // 数据发送完毕
            });
        }
    }, 500);
}
/**
 * 重置主连接为null
 */
function revokeWS() {
    mainConnection = null;
}

/**
 * 实例端WebSocket路由
 * @param {Object} recvObj 接收到的数据对象
 * @param {WebSocket} ws WebSocket实例
 */
function router(recvObj, ws) {
    mainConnection = ws; // 记录主WebSocket连接
    let { action } = recvObj; // 获得实例端回应的动作
    switch (action) {
        case 'status_sync': // 同步状态信息
            let statusCode = recvObj['status_code']; // 获得状态代码
            if (statusCode > 2200) { // 状态码要大于2200才正常
                outputer(1, 'Status synchronized!');
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
        case 'players_num': // 同步玩家数量
            {
                let { online, max } = recvObj; // 获得玩家数量
                console.log(`Online: ${online}/${max}`); // 输出玩家数量
                utils.setMCInfo(['players_online', 'players_max'], [online, max]); // 记录玩家数量
            }
            break;
    }
}

module.exports = {
    router,
    revokeWS,
    send
}