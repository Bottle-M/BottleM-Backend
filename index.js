'use strict';
const httpServer = require('http');
const configs = require('./basic/config-box');
const outputer = require('./basic/output');
const apiConfigs = configs['apiConfigs'];

let port = apiConfigs['api_port']; // 获取配置的端口号
httpServer.createServer(function (req, res) {
    let reqUrl = new URL(req.url, 'http://localhost'), // 构建一个URL对象
        reqPath = reqUrl.pathname, // 获得请求路径
        reqParams = reqUrl.searchParams, // 获得请求参数
        reqMethod = req.method.toLowerCase(); // 获得请求方法
    console.log(reqPath);
    console.log(reqParams);
    console.log(reqMethod);
    // 设定返回头
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('Hello World!');
}).listen(port, () => {
    // 监听指定端口
    outputer(1, 'HTTP API Launched successfully.');
});

