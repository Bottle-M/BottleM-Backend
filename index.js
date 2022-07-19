'use strict';
const httpServer = require('http');
const configs = require('./basic/config-box');
const outputer = require('./basic/output');
const apiConfigs = configs['apiConfigs'];
const router = require('./api/router');
const auther = require('./basic/token-auth');

let port = apiConfigs['api_port']; // 获取配置的端口号
httpServer.createServer(function (req, res) {
    let reqUrl = new URL(req.url, 'http://localhost'), // 构建一个URL对象
        reqPath = reqUrl.pathname, // 获得请求路径
        reqParams = reqUrl.searchParams, // 获得请求参数
        reqMethod = req.method.toLowerCase(),// 获得请求方法
        authStr = req.headers['authorization'] || '', // 获得请求头的authorization
        authToken = authStr.replace(/^(Bearer\s+?)(\S+)$/i, (match, p1, p2) => p2), // 把token提取出来
        resultStatus = 200, // 返回状态码
        resultObj = { // 返回结果
            data: new Object(),
            status: -1, // 0代表异步处理，为1则代表成功，为-1代表失败
            msg: ''
        };
    // 将请求路径进行分割
    reqPath = reqPath.split('/').filter(item => item !== '');
    if (!authToken) { // 没有token
        resultObj.msg = 'Unauthorized';
        resultStatus = 401;
    } else if (auther(authToken, reqPath)) { // 鉴权通过
        // 设定返回头
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // 路由转交任务
        resultObj = router({
            path: reqPath,
            params: reqParams,
            method: reqMethod
        }, resultObj);
    } else {
        resultObj.msg = 'Permission Denied';
        resultStatus = 403;
    }
    res.writeHead(resultStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(resultObj));
}).listen(port, () => {
    // 监听指定端口
    outputer(1, 'HTTP API Launched successfully.');
});

