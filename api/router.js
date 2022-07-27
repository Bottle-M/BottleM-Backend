// HTTP API路由
'use strict';
const server = require('./server');
const utils = require('./server-utils')

// 检查是否意外重启
let currentStatus = utils.getStatus('status_code');
if (currentStatus && currentStatus > 2000) {
    console.log('Trying to resume...');
    // 状态码>2000说明上一次进程结束时服务器仍在部署/运行
    server.resume(); // 恢复上一次连接
}

/**
 * 针对backend操作进行分发
 * @param {*} resultData 返回数据
 * @param {*} reqPath 在backend下的请求路径
 * @param {*} reqParams 请求的参数
 * @param {*} reqMethod 请求的方法（小写，get/post/put...）
 * @returns 返回一个对象，包含了请求的结果
 */
function backendRouter(resultData, reqPath, reqParams, reqMethod) {

    return resultData;
}

/**
 * 针对server操作进行分发
 * @param {*} resultObj 返回数据
 * @param {*} reqPath 在server下的请求路径
 * @param {*} reqAction 请求的操作
 * @param {*} reqMethod 请求的方法（小写，get/post/put...）
 * @returns 返回一个对象，包含了请求的结果
 */
function serverRouter(resultObj, reqPath, reqAction, reqMethod) {
    let action = reqAction || '';
    outer:
    switch (reqPath) {
        case 'maintenance': // /server/maintenance
            switch (action) {
                case 'pem':
                    break outer; // 直接跳出外层
                case 'revive':
                    break outer;
                case 'stop':
                    break outer;
                case 'kill':
                    break outer;
                default:
                    break;
            }
        case 'normal': // /server/normal
            if (action == 'launch') { // 开始部署服务器
                resultObj = server.launch(resultObj);
                break;
            } else {
                resultObj.msg = 'Lack of Valid Action';
                resultObj.status = 400;
                break;
            }
        default:
            resultObj.msg = 'Non-existent Node';
            resultObj.status = 400;
            break;
    };
    return resultObj;
}

/**
 * API路由
 * @param {Object} reqObj 包含请求数据的对象 
 * @param {Object} resultObj 返回数据的对象
 * @return 返回一个对象，包含了请求的结果
 */
module.exports = function (reqObj, resultObj) {
    let { rPath, params, method } = reqObj;
    if (rPath[1]) {
        switch (rPath[0]) {
            case 'server':
                resultObj = serverRouter(resultObj, rPath[1], rPath[2], method);
                break;
            case 'backend':
                resultObj = backendRouter(resultObj, rPath[1], params, method);
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