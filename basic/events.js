// 事件相关的模块
'use strict';
const { EventEmitter } = require('events');

module.exports = {
    // 服务器相关事件
    ServerEvents: new EventEmitter(),
    // 消息相关事件
    MessageEvents: new EventEmitter()
}