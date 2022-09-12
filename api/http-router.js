// HTTP API路由
'use strict';
const server = require('./server');
const utils = require('./server-utils');

// 检查是否意外重启
let currentStatus = utils.getStatus('status_code');
if (currentStatus && currentStatus > 2000) {
    console.log('Trying to resume...');
    // 状态码>2000说明上一次进程结束时服务器仍在部署/运行
    server.resume(); // 恢复上一次的工作
}

/**
 * 针对backend操作进行分发
 * @param {Object} resultObj 返回数据
 * @param {String} reqPath 在backend下的请求路径
 * @param {URLSearchParams} reqParams 请求的参数
 * @param {String} reqMethod 请求的方法（小写，get/post/put...）
 * @returns 返回一个对象，包含了请求的结果
 */
function backendRouter(resultObj, reqPath, reqParams, reqMethod) {

    return resultObj;
}

/**
 * 针对server操作进行分发
 * @param {Object} resultObj 返回数据
 * @param {String} reqPath 在server下的请求路径
 * @param {String} reqAction 请求的操作
 * @param {String} reqMethod 请求的方法（小写，get/post/put...）
 * @param {URLSearchParams} postParams POST的数据
 * @returns 返回一个对象，包含了请求的结果
 */
function serverRouter(resultObj, reqPath, reqAction, reqMethod, postParams) {
    let action = reqAction || '',
        underMaintenance = false;
    outer:
    switch (reqPath) {
        case 'command': { // /server/command
            let command = postParams.get('command');
            if (reqMethod === 'post' && action === 'send' && command) {
                server.sendCommand(command, resultObj);
            } else {
                resultObj.msg = 'Invalid Request';
                resultObj.status = 400;
            }
        }
            break;
        case 'maintenance': // /server/maintenance
            switch (action) {
                case 'pem':
                    break outer; // 直接跳出外层
                case 'revive':
                    break outer;
                case 'stop':
                    server.stop(false, resultObj); // 发送关服指令 
                    break outer;
                case 'kill':
                    server.stop(true, resultObj); // 发送杀死指令 
                    break outer;
                case 'discardbackup': // 抛弃增量备份
                    {
                        server.launch(false, 'discard', resultObj);
                    }
                    break outer;
                default:
                    underMaintenance = true; // 维护模式
                    break;
            }
        case 'normal': // /server/normal
            switch (action) {
                case 'launch': // 开始部署服务器
                    server.launch(underMaintenance, false, resultObj);
                    break outer;
                case 'restorelaunch': // 开始恢复增量备份，并部署服务器
                    server.launch(underMaintenance, true, resultObj);
                    break outer;
                default:
                    resultObj.msg = 'Lack of Valid Action';
                    resultObj.status = 400;
                    break;
            }
            break;
        default:
            resultObj.msg = 'Non-existent Node';
            resultObj.status = 400;
            break;
    };
    return resultObj;
}

/**
 * HTTP API路由
 * @param {Object} reqObj 包含请求数据的对象 
 * @param {Object} resultObj 返回数据的对象
 * @return 返回一个对象，包含了请求的结果
 */
module.exports = function (reqObj, resultObj) {
    let { reqPath, params, method, postParams } = reqObj;
    if (reqPath[1]) {
        switch (reqPath[0]) {
            case 'server':
                serverRouter(resultObj, reqPath[1], reqPath[2], method, postParams);
                break;
            case 'backend':
                backendRouter(resultObj, reqPath[1], params, method);
                break;
            default:
                resultObj.msg = 'Invalid Request';
                resultObj.status = 400;
                break;
        }
    } else {
        resultObj.msg = 'Invalid Path';
        resultObj.status = 400;
    }
    return resultObj;
};