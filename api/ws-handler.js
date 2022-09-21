// WebSocket接受数据处理
'use strict';
// 导入服务器事件Emitter
const { ServerEvents } = require('../basic/events');
const utils = require('./server-utils');
const outputer = require('./../basic/output');
var dataSending = false; // 是否有正在发送的数据
var mainConnection = null; // 记录主WebSocket连接


/**
 * 通过主WebSocket发送数据，如果未发送成功会伺机重新发送
 * @param {String} respJSON 待发送的JSON字符串
 * @note https://github.com/websockets/ws/issues/999#issuecomment-279233272
 */
function send(respJSON) {
    let timer = setInterval(() => {
        // 在主连接存活且没有正在发送数据的情况下，发送数据
        if (mainConnection && !dataSending) {
            dataSending = true;
            clearInterval(timer);
            mainConnection.send(respJSON, (err) => {
                if (err) {
                    // 出现错误就reject
                    outputer(2, `Failed to send data to InsSide:${err}`);
                    return;
                }
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
                outputer(1, '[Status synchronized]');
                utils.setStatus(statusCode); // 设置状态码
                if (statusCode >= 2300 && statusCode < 2400) {
                    // 状态码[2300,2400)代表服务器正在运行
                    let commands = utils.flushCommands(); // 冲洗本地缓存的命令
                    console.log('Flushed commands:', commands);
                    commands.forEach((command) => {
                        send(utils.buildWSReq('command', {
                            command: command
                        }));
                    });
                }
            } else {
                outputer(2, 'Invalid status code from InsSide!');
            }
            break;
        case 'mc_log_sync': // 增量同步Minecraft服务器日志
            {
                let { logs, reread } = recvObj; // 取得更新的日志字符串
                utils.recvMCLogs(logs, reread); // 更新日志
                // 触发日志更新事件，通过WebSocket推送
                ServerEvents.emit('mclogupdate', logs);
            }
            break;
        case 'log_sync': // 同步一条实例端日志
            {
                let { level, msg, time, error } = recvObj; // 获得日志数据
                if (!error) {
                    outputer(level, msg, true, time); // 输出日志
                } else {
                    // 实例端发生错误，转到错误处理函数
                    utils.errorHandler(msg, 'insside', time);
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
        case 'idling_time_left': // 同步倒计时
            {
                let { time } = recvObj; // 获得倒计时
                utils.setMCInfo('idling_time_left', time); // 记录倒计时
            }
            break;
        case 'backup_sync': // 同步增量备份相关信息
            {
                // 如果实例端发送过来的records=null，说明增量备份用不上，会删除本地的增量备份记录
                let { name, time } = recvObj; // 获得备份记录
                utils.recordBackup({
                    name: name,
                    time: time
                }); // 记录备份记录
            }
            break;
        case 'revoke_backup': // 舍弃现有的增量备份记录
            utils.recordBackup(null, true); // 删除备份记录
            break;
        case 'launch_success': // Minecraft服务器刚刚启动成功
            // 触发启动成功事件
            ServerEvents.emit('launchsuccess', utils.getInsDetail('instance_ip'));
            break;
    }
}

module.exports = {
    router,
    revokeWS,
    send
}