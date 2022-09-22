// 示范扩展：消息上报者
// 扩展主要依赖于事件模块，也就是../basic/event.js
'use strict';
// 导入EventEmitters
const events = require('../basic/events');

events.MessageEvents.on('errormsg', (msg, inform) => {
    // 错误消息上报
    console.log('[REPORT ERROR] ', msg);
});

events.MessageEvents.on('statusupdate', (msg, inform, code) => {
    // 状态码更新
    // inform是一个布尔值，对于是否需要上报给出了一个建议
    if (inform) {
        console.log('[REPORT STATUS]', msg);
    }
});

events.ServerEvents.on('launchsuccess', (ip) => {
    // 服务器启动成功
    console.log(`[REPORT SUCCESS]Server successfully launched, ip: ${ip}`);
});

events.ServerEvents.on('serverclosed', (reason) => {
    // 服务器关闭
    console.log(`[REPORT]Server closed, reason: ${reason}`);
});

/**
 * 扩展载入方法，由extensions-loader调用
 * @returns {Boolean} 是否正确载入
 */
module.exports = function () {
    return true;
};