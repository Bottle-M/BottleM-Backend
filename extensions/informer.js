// 示范扩展：消息上报者
// 扩展主要依赖于事件模块，也就是../basic/event.js
'use strict';
// 导入EventEmitters
const events = require('../basic/events');

events.MessageEvents.on('')

/**
 * 扩展载入方法，由extensions-loader调用
 * @returns {Boolean} 是否正确载入
 */
module.exports = function () {
    return true;
};