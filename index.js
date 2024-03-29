'use strict';
const httpServer = require('http');
const { WebSocketServer } = require('ws');
const { ServerEvents } = require('./basic/events');
const { auther } = require('./basic/token-auth');
const loadExtensions = require('./basic/extensions-loader');
const outputer = require('./basic/output');
const router = require('./api/http-router');
const API_CONFIGS = require('./basic/config-box')['apiConfigs'];
// 获得HTTP API服务开放端口
const HTTP_API_PORT = API_CONFIGS['api_port'];
// 获得WebSocket服务开放端口
const MC_LOG_WS_PORT = API_CONFIGS['ws_port'];
// 获得WebSocket连接超时时间
const WS_CONN_TIMEOUT = API_CONFIGS['ws_ping_timeout'];

// 载入扩展
loadExtensions();

// ------------------------------------------HTTP服务
httpServer.createServer(function (req, res) {
    let reqUrl = new URL(req.url, 'http://localhost'), // 构建一个URL对象
        reqPath = reqUrl.pathname, // 获得请求路径
        reqMethod = req.method.toLowerCase(),// 获得请求方法
        authStr = req.headers['authorization'] || '', // 获得请求头的authorization
        authToken = authStr.replace(/^(Bearer\s+?)(\S+)$/i, (match, p1, p2) => p2), // 把token提取出来
        resultObj = { // 返回结果
            data: new Object(),
            code: -1, // 0代表异步处理，为1则代表成功，为-1代表失败
            msg: '',
            respType: 'json', // 返回类型(json/text)
            status: 200, // 返回状态码
            readableStream: null // 可读流(respType为text时有效)
        },
        headers = {
            'Allow': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        postBody = ''; // POST请求的body
    // 特殊处理OPTIONS请求(因为前端跨域要预检)，直接返回200
    if (reqMethod === 'options') {
        resultObj.code = 1;
        resultObj.msg = 'OK';
        res.writeHead(resultObj.status, headers);
        res.end(JSON.stringify(resultObj));
        return;
    }
    // 正式开始处理请求
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
        let postObject;
        try {
            // 容错处理，防止给整崩了
            postObject = JSON.parse(postBody);
        } catch (err) {
            // 如果传来的不是JSON，就当没收到数据
            postObject = new Object();
        }
        // 开始处理请求
        // 将请求路径进行分割
        const reqPathArr = reqPath.split('/').filter(item => item !== '');
        if (!authToken) { // 没有token
            resultObj.msg = 'Unauthorized';
            resultObj.status = 401;
        } else if (auther(authToken, reqPathArr)) { // 鉴权通过
            // 路由转交任务
            resultObj = router({
                reqPath: reqPathArr,
                method: reqMethod,
                postObject: postObject
            }, resultObj);
        } else {
            resultObj.msg = 'Permission Denied';
            resultObj.status = 403;
        }
        switch (resultObj.respType) {
            case 'text': // 直接返回文本（用于流式传输服务器日志）
                headers['Content-Type'] = 'text/plain';
                res.writeHead(resultObj.status, headers);
                if (!resultObj.readableStream) {
                    res.end(''); // 返回空白
                } else {
                    resultObj.readableStream.pipe(res, {
                        end: true // 可读流关闭时也关闭可写流res
                    }); // 如果有，就返回可读流
                }
                break;
            default: // 默认返回JSON
                res.writeHead(resultObj.status, headers);
                delete resultObj['status']; // 移除status字段
                delete resultObj['respType']; // 移除respType字段
                delete resultObj['readableStream']; // 移除readableStream字段
                res.end(JSON.stringify(resultObj));
                break;
        }
    });
}).listen(HTTP_API_PORT, () => {
    // 监听指定端口
    outputer(1, `HTTP API Launched successfully (Port:${HTTP_API_PORT}).`);
});

// ------------------------------------------Minecraft日志递送WebSocket服务器
const mcLogServer = new WebSocketServer({
    port: MC_LOG_WS_PORT,
    clientTracking: true
});
// WebSocket心跳
const wsBeatBack = function () {
    if (this.authorized)// 前提：连接已经通过认证
        this.connAlive = true; // 标记连接正常
}
// 处理WebSocket消息
mcLogServer.on('listening', () => {
    outputer(1, `WebSocket Server started successfully (Port:${MC_LOG_WS_PORT}).`);
}).on('connection', (ws) => {
    ws.connAlive = true; // 新连接默认都是正常的
    ws.on('message', (message) => {
        let parsed;
        try { // 防止非法数据给整崩了
            parsed = JSON.parse(message);
        } catch (e) {
            parsed = {};
        }
        // 权限节点websocket.mclog.receive
        if (auther(parsed['key'], ['websocket', 'mclog', 'receive'])) {
            ws.authorized = true; // 标记连接已经认证
            ws.connAlive = true; // 标记连接存活
        } else {
            // 未通过认证的直接关闭
            ws.close(1000, 'Nanoconnection, son.');
        }
    }).on('close', () => {
        ws.connAlive = false; // 标记连接已经死亡
        console.log('Connection closed');
    }).on('pong', wsBeatBack.bind(ws)); // 接受心跳（pong是为响应ping而自动发送的）
}).on('error', (err) => {
    outputer(3, `Websocket Server Error:${err}.`);
});

const beatInterval = setInterval(() => {
    mcLogServer.clients.forEach((ws) => { // 检测死亡连接
        if (!ws.connAlive) { // 连接非存活
            return ws.terminate(); // 强制终止连接
        }
        ws.connAlive = false; // 标记连接非存活
        ws.ping(); // 发送心跳包
    });
}, WS_CONN_TIMEOUT);

// Minecraft日志更新事件
ServerEvents.on('mclogupdate', (logStr) => {
    let clientStack = [], // 待广播的WebSocket客户端
        logSending = false; // 是否正在发送日志
    // 向所有认证端发送日志
    mcLogServer.clients.forEach((ws) => {
        if (ws.authorized) {
            // 将客户端压入栈
            clientStack.push(ws);
        }
    });
    let poller = setInterval(() => {
        if (clientStack.length === 0) { // 栈空，已经发送给所有客户端
            clearInterval(poller);
            return;
        }
        if (!logSending) {
            logSending = true; // 标记正在发送日志给一端
            // 出栈
            clientStack.pop().send(logStr, (err) => {
                if (err) {
                    outputer(2, `Error while broadcasting log to clients:${err}`);
                }
                logSending = false; // 标记一端发送完毕
            });
        }
    }, 100);
});

// ws服务关闭时清理
mcLogServer.on('close', () => {
    clearInterval(beatInterval);
});