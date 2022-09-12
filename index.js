'use strict';
const httpServer = require('http');
const outputer = require('./basic/output');
const router = require('./api/http-router');
const auther = require('./basic/token-auth');
// 获得api服务开放端口
const HTTP_API_PORT = require('./basic/config-box')['apiConfigs']['api_port'];

httpServer.createServer(function (req, res) {
    let reqUrl = new URL(req.url, 'http://localhost'), // 构建一个URL对象
        reqPath = reqUrl.pathname, // 获得请求路径
        reqParams = reqUrl.searchParams, // 获得请求参数
        reqMethod = req.method.toLowerCase(),// 获得请求方法
        authStr = req.headers['authorization'] || '', // 获得请求头的authorization
        authToken = authStr.replace(/^(Bearer\s+?)(\S+)$/i, (match, p1, p2) => p2), // 把token提取出来
        resultObj = { // 返回结果
            data: new Object(),
            code: -1, // 0代表异步处理，为1则代表成功，为-1代表失败
            msg: '',
            status: 200 // 返回状态码
        },
        postBody = ''; // POST请求的body
    // 接收POST请求的数据
    req.on('data', (chunk) => {
        postBody += chunk;
        // POST提交的数据超过了1MB，强制断开连接
        if (postBody.length >= 1048576) {
            req.socket.destroy();
            resultObj.msg = 'Request Entity Too Large';
            resultObj.status = 413;
        }
    });
    // POST请求数据接收完毕
    req.on('end', () => {
        // 解析postBody
        let postParams = new URLSearchParams(postBody);
        // 开始处理请求
        // 将请求路径进行分割
        reqPath = reqPath.split('/').filter(item => item !== '');
        if (!authToken) { // 没有token
            resultObj.msg = 'Unauthorized';
            resultObj.status = 401;
        } else if (auther(authToken, reqPath)) { // 鉴权通过
            // 路由转交任务
            resultObj = router({
                reqPath: reqPath,
                params: reqParams,
                method: reqMethod,
                postParams: postParams
            }, resultObj);
        } else {
            resultObj.msg = 'Permission Denied';
            resultObj.status = 403;
        }
        res.writeHead(resultObj.status, { 'Content-Type': 'application/json' });
        delete resultObj['status']; // 移除status字段
        res.end(JSON.stringify(resultObj));
    });
}).listen(HTTP_API_PORT, () => {
    // 监听指定端口
    outputer(1, 'HTTP API Launched successfully.');
});

