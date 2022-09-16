// HTTP API路由
'use strict';
const server = require('./server');
const utils = require('./server-utils');
// 采用POST请求的操作
const USING_POST_METHODS = {
    server: {
        command: {
            send: true
        }
    }
};

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
 * @param {String} reqNode 在backend下请求的节点
 * @param {String} reqAction 请求的操作
 * @param {URLSearchParams} postParams POST的数据
 * @returns 返回一个对象，包含了请求的结果
 */
function backendRouter(resultObj, reqNode, reqAction, postParams) {

    return resultObj;
}

/**
 * 针对server操作进行分发
 * @param {Object} resultObj 返回数据
 * @param {String} reqNode 在server下请求的节点
 * @param {String} reqAction 请求的操作
 * @param {URLSearchParams} postParams POST的数据
 * @returns 返回一个对象，包含了请求的结果
 */
function serverRouter(resultObj, reqNode, reqAction, postParams) {
    let action = reqAction || '',
        underMaintenance = false;
    outer:
    switch (reqNode) {
        case 'mc_logs': // /server/mc_logs

            break;
        case 'command': { // /server/command
            let command = postParams.get('command');
            if (action === 'send' && command) {
                server.sendCommand(command, resultObj);
            } else {
                resultObj.msg = 'Invalid Request';
                resultObj.status = 400;
            }
        }
            break;
        case 'maintenance': // /server/maintenance
            switch (action) {
                case 'get_key':
                    {
                        let key = utils.getSSHPrivateKey();
                        if (key) {
                            resultObj.code = 1;
                            resultObj.msg = 'Please take care of it.';
                            resultObj.data['privateKey'] = key;
                        } else {
                            // 还没有密匙
                            resultObj.msg = 'Private key not found.';
                        }
                    }
                    break outer; // 直接跳出外层
                case 'revive':
                    server.revive(resultObj); // 清除当前错误，尝试恢复正常
                    break outer;
                case 'wipe_butt':
                    server.wipeButt(); // 退还所有资源
                    resultObj.msg = 'Resources were terminated.';
                    resultObj.code = 0;
                    break outer;
                case 'stop':
                    server.stop(false, resultObj); // 发送关服指令 
                    break outer;
                case 'kill':
                    server.stop(true, resultObj); // 发送杀死指令 
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
                case 'restore_and_launch': // 开始恢复增量备份，并部署服务器
                    server.launch(underMaintenance, true, resultObj);
                    break outer;
                case 'launch_and_discard_backup': // 抛弃增量备份
                    server.launch(underMaintenance, 'discard', resultObj);
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
    let { reqPath, method, postParams } = reqObj;
    if (reqPath[1]) {
        let [reqResrc, reqNode, reqAction] = reqPath, // 获得请求的资源，节点和操作
            resPostObj = USING_POST_METHODS[reqResrc] || {},
            nodePostObj = resPostObj[reqNode] || {},
            actionUsingPost = nodePostObj[reqAction] || false; // 检查操作是否需要POST
        if (actionUsingPost && method !== 'post') {
            // 需要使用POST但是没有使用POST的操作，直接返回错误
            resultObj.msg = 'Method Not Allowed';
            resultObj.status = 405;
            return resultObj;
        }
        switch (reqResrc) {
            case 'server':
                serverRouter(resultObj, reqNode, reqAction, postParams);
                break;
            case 'backend':
                backendRouter(resultObj, reqNode, reqAction, postParams);
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