// HTTP API路由
'use strict';


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
 * @param {*} resultData 返回数据
 * @param {*} reqPath 在server下的请求路径
 * @param {*} reqAction 请求的操作
 * @param {*} reqMethod 请求的方法（小写，get/post/put...）
 * @returns 返回一个对象，包含了请求的结果
 */
function serverRouter(resultData, reqPath, reqAction, reqMethod) {
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
            if (action == 'launch') {

                break;
            }
        default:
            resultData.msg = 'Lack of Valid Action';
            break;
    };
    return resultData;
}

/**
 * API路由
 * @param {Object} reqObj 包含请求数据的对象 
 * @param {Object} resultData 返回数据的对象
 * @return 返回一个对象，包含了请求的结果
 */
module.exports = function (reqObj, resultData) {
    let { path, params, method } = reqObj;
    if (path[1]) {
        switch (path[0]) {
            case 'server':
                resultData = serverRouter(resultData, path[1], path[2], method);
                break;
            case 'backend':
                resultData = backendRouter(resultData, path[1], params, method);
                break;
            default:
                resultData.msg = 'Invalid Request';
                break;
        }
    } else {
        resultData.msg = 'Invalid Path';
    }
    return resultData;
};