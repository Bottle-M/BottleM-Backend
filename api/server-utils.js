// server.js中常用的工具
'use strict';
const fs = require('fs');
const ascFs = fs.promises;
const path = require('path');
const tools = require('../basic/tools');
const cloud = require('./qcloud');
const jsons = require('../basic/json-scaffold');
const outputer = require('../basic/output');
const WebSocket = require('ws');
const ssh2Client = require('ssh2').Client;
const configs = require('../basic/config-box');
const { MessageEvents } = require('../basic/events');
const {
    backendStatusPath: BACKEND_STATUS_FILE_PATH,
    insDetailsPath: INS_DETAILS_FILE_PATH,
    launchLockPath: LOCK_FILE_PATH,
    mcTempCmdPath: MC_TEMP_CMD_FILE_PATH,
    serverTempDir: SERVER_TEMP_DIR,
    loginKeyPath: LOGIN_KEY_FILE_PATH
} = configs;
const API_CONFIGS = configs['apiConfigs'];
// 实例端最初配置对象
const INITIAL_INS_SIDE_CONFIGS = API_CONFIGS['ins_side'];
// 实例端临时配置的文件名（如果这一项改了，InsSide的源码也要改）
const INS_TEMP_CONFIG_FILE_NAME = 'ins_side_configs.tmp.json';
// 实例端临时配置的绝对路径
const INS_TEMP_CONFIG_FILE_PATH = path.join(__dirname, `../${SERVER_TEMP_DIR}/${INS_TEMP_CONFIG_FILE_NAME}`);
// Minecraft服务器信息文件的绝对路径
const MC_SERVER_INFO_FILE_PATH = path.join(__dirname, `../${SERVER_TEMP_DIR}/mc_server_info.json`);
// 增量备份文件记录数据
const BACKUP_RECORD_FILE_NAME = 'backup_records.json';
const BACKUP_RECORD_FILE_PATH = path.join(__dirname, `../${SERVER_TEMP_DIR}/${BACKUP_RECORD_FILE_NAME}`);
// Minecraft服务器日志文件路径
const MC_SERVER_LOG_FILE_PATH = path.join(__dirname, `../${SERVER_TEMP_DIR}/mc_latest.log`);
// 所有必要数据上传到实例中的哪里（绝对路径）
const INS_DATA_DIR = configs['insDataDir'];
// 在内存中记录先前的STATUS_CODE，用于setStatus方法
var PREV_STATUS_CODE = -1; // -1代表未初始化

// 检查backend_status状态记录文件是否存在
try {
    fs.statSync(BACKEND_STATUS_FILE_PATH);
} catch (e) {
    // 不存在就创建一个
    fs.writeFileSync(BACKEND_STATUS_FILE_PATH, JSON.stringify(configs['initialBackendStatus']), {
        encoding: 'utf8'
    });
}

/**
 * （同步）返回Minecraft服务器日志的readableStream
 * @returns {ReadableStream|null} 如果失败会返回null
 */
function readMCLogs() {
    try {
        // 先检查文件是否存在
        fs.statSync(MC_SERVER_LOG_FILE_PATH);
        return fs.createReadStream(MC_SERVER_LOG_FILE_PATH);
    } catch (e) {
        return null;
    }
}

/**
 * （同步）接收Minecraft服务器的日志
 * @param {String} logStr 日志字符串
 * @param {Boolean} logReread 是否重读了日志
 * @return {Boolean} 是否接收成功
 */
function recvMCLogs(logStr, logReread) {
    try {
        if (logReread) {
            // 重读日志，直接覆盖写入
            fs.writeFileSync(MC_SERVER_LOG_FILE_PATH, logStr, {
                encoding: 'utf8'
            });
        } else {
            // 追加写入
            fs.appendFileSync(MC_SERVER_LOG_FILE_PATH, logStr, {
                encoding: 'utf8'
            });
        }
    } catch (e) {
        outputer(2, `Failed to receive Minecraft server logs:${e}`);
        return false;
    }
    return true;
}

/**
 * （同步）检查记录增量备份的文件是否存在
 * @returns {Boolean}
 */
function backupExists() {
    try {
        fs.statSync(BACKUP_RECORD_FILE_PATH);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * （同步）返回增量备份文件记录数据
 * @returns {Array|null} 数组，如果失败会返回null
 */
function readBackupRecs() {
    return jsons.scRead(BACKUP_RECORD_FILE_PATH);
}

/**
 * （同步）记录增量备份的文件
 * @param {Object} dataObj 文件信息对象
 * @param {Boolean} revokeAll 是否删除（抛弃增量备份）
 */
function recordBackup(dataObj, revokeAll = false) {
    try {
        if (revokeAll) {
            fs.rmSync(BACKUP_RECORD_FILE_PATH, {
                force: true // 即使文件不存在，也不要报错
            });
        } else {
            let records = jsons.scRead(BACKUP_RECORD_FILE_PATH) || [];
            records.push(dataObj);
            fs.writeFileSync(BACKUP_RECORD_FILE_PATH, JSON.stringify(records), {
                encoding: 'utf8'
            });
        }
    } catch (e) {
        outputer(2, `Failed to record backup: ${e}`);
    }
}

/**
 * （同步）设置backend_status状态文件
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 * @returns {Boolean} 是否成功
 */
function updateBackendStatus(keys, values) {
    return jsons.scSet(BACKEND_STATUS_FILE_PATH, keys, values);
}


/**
 * （同步）根据状态代号设置状态信息
 * @param {Number} code 
 * @returns {Boolean} 是否成功
 */
function setStatus(code) {
    // 如果状态码没有变化，就不要更新了
    if (code === PREV_STATUS_CODE) return true;
    // 获得对应状态码的配置
    let corresponding = configs['statusConfigs'][code],
        msg = corresponding['msg'],
        inform = corresponding['inform'];
    // 触发statusupdate事件, callback(消息, 是否通知(仅作参考), status代码)
    MessageEvents.emit('statusupdate', msg, inform, code);
    outputer(1, msg);
    PREV_STATUS_CODE = code; // 更新内存中的状态码
    return updateBackendStatus(['status_msg', 'status_code'], [msg, code]);
}

/**
 * （同步）设置InstanceDetail文件
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 * @returns {Boolean} 是否成功
 */
function setInsDetail(keys, values) {
    return jsons.scSet(INS_DETAILS_FILE_PATH, keys, values);
}

/**
 * 销毁脱离控制(Out-Of-Control)的实例（筛选范围基于ProjectID）
 * @returns {Promise}
 * @note 注意，这是一个危险操作，可能造成数据丢失
 */
function terminateOOCIns() {
    let insId = getInsDetail('instance_id'),
        timer = null;
    outputer(1, 'Waiting to terminate out-of-control instance(s)...');
    return new Promise((resolve, reject) => {
        timer = setInterval(() => {
            cloud.describeInstance().then(insSets => {
                // 保证当前所有实例都不在“创建中”状态
                // 不然可能触发腾讯云的BUG
                let allCreated = insSets.every(insInfo => {
                    return !(['PENDING', 'TERMINATING'].includes(insInfo['InstanceState']));
                });
                if (allCreated) {
                    clearInterval(timer);
                    resolve(insSets);
                }
            }).catch(err => {
                reject(err);
            });
        }, 5000);
    }).then(insSets => {
        // 筛选出当前project中未受控制的实例（insId不匹配）
        // 如果insId为空，所有当前project中的实例会被销毁
        let terminateIds = insSets.filter(insInfo => {
            return (!insId) || (insInfo['InstanceId'] !== insId);
        }).map(insInfo => {
            // 转换为待销毁实例id数组
            return insInfo['InstanceId'];
        });
        // 如果没有需要销毁的实例，则直接返回
        if (terminateIds.length === 0)
            return Promise.resolve('done');
        return cloud.terminateInstance(terminateIds);
    }).catch(err => {
        clearInterval(timer);
        return Promise.reject(`Error occurred while terminating out-of-control instance(s): ${err}`);
    })
}

/**
 * （同步）获得状态文件内容 
 * @param {String} key 查询的键，留空会返回所有键值对
 * @returns 对象或者单个类型的值，读取失败会返回null
 */
function getStatus(key = '') {
    let status = jsons.scRead(BACKEND_STATUS_FILE_PATH);
    if (status) {
        return key ? status[key] : status;
    } else {
        return null;
    }
}

/**
 * （同步）获得创建的实例的参数
 * @param {String} key 查询的键，留空会返回所有键值对
 * @returns 对象或者单个类型的值，读取失败会返回null
 */
function getInsDetail(key = '') {
    let details = jsons.scRead(INS_DETAILS_FILE_PATH);
    if (details) {
        return key ? details[key] : details;
    } else {
        return null;
    }
}

/**
 * （同步）删除文件，不会抛出错误
 * @param {String} filePath 文件路径
 */
function safeDel(filePath) {
    try {
        fs.rmSync(filePath);
    } catch (e) {
        console.log(`Unable to remove file: ${filePath}`);
    }
}

/**
 * （同步）清空实例临时文件
 * @returns 布尔值true/false 代表 是/否 成功
 * @note 不会清除增量备份记录文件，丢弃增量备份记录文件需要用recordBackup(null,true)
 */
function clearServerTemp() {
    try {
        let files = fs.readdirSync(SERVER_TEMP_DIR);
        files.forEach((tmp) => {
            // 排除增量备份记录文件，这个是额外删除的
            if (!(tmp === BACKUP_RECORD_FILE_NAME))
                fs.rmSync(path.join(__dirname, `../${SERVER_TEMP_DIR}`, tmp));
        });
        return true;
    } catch (err) {
        outputer(3, `Failed to clean Server Temp: ${err}`);
        return false;
    }
}

/**
 * 发生错误时进行的工作
 * @param {String} msg 错误信息
 * @param {String} errFrom 错误来源，默认为'backend'，还可以是'insside'
 * @param {Number} time 日志时间戳（不指定则自动获取当前时间）
 */
function errorHandler(msg, errFrom = 'backend', time = 0) {
    // 错误信息
    let errMsg = `Fatal:${msg}`,
        errTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }); // 错误发生的时间
    jsons.ascRead(BACKEND_STATUS_FILE_PATH).then(parsed => {
        let currentCode = Number(parsed['status_code']),
            topDigitDiff = Math.floor(currentCode / 1000) - 1,// 代号最高位数字差
            errCode = currentCode - topDigitDiff * 1000;// 减去最高位数字差
        // 特殊处理2000对应的错误: 1000错误代表没有合适的实例
        if (errCode === 1000) {
            // 输出错误，记入日志，等级：警告
            outputer(2, errMsg, true, time);
            // 删除部署锁定文件
            safeDel(LOCK_FILE_PATH);
        } else {
            // 输出错误，记入日志，等级：错误
            outputer(3, errMsg, true, time);
            // 标记状态：错误
            updateBackendStatus(
                [
                    'status_msg',
                    'status_code',
                    'last_err',
                    'last_err_time',
                    'err_from'
                ],
                [
                    errMsg,
                    errCode,
                    errMsg,
                    errTime,
                    errFrom
                ]
            );
        }
    }).catch(err => {
        outputer(3, `Error occurred while handling ERROR:${err}`, false);
    });
}





/**
 * （异步）通过SSH上传数组中的文件
 * @param {ssh2Client} sshConn ssh2客户端对象
 * @param {Array} fileArr 文件（绝对路径）组成的二维数组
 * @returns {Promise} 
 * @note fileArr的每一项：[本地文件绝对路径,实例上文件的绝对路径]
 */
function fastPutFiles(sshConn, fileArr) {
    let tasks = [];
    // 创建sftp端
    return new Promise((resolve, reject) => {
        sshConn.sftp((err, sftp) => {
            if (err) throw err;
            fileArr.forEach(filePaths => {
                let [localPath, remotePath] = filePaths;
                remotePath = toPosixSep(remotePath); // 将分隔符转换为POSIX风格
                tasks.push(new Promise((res, rej) => {
                    sftp.fastPut(localPath, remotePath, {
                        mode: 0o755 // 设定文件权限（八进制）
                    }, err => {
                        if (err) {
                            rej(err);
                        } else {
                            // 成功传输一个文件
                            console.log(`Put:${localPath} -> ${remotePath}`);
                            res('done');
                        }
                    });
                }));
            });
            // 等待所有Promise完成
            Promise.all(tasks)
                .then((res) => {
                    resolve(res);
                }).catch(e => {
                    reject(e);
                })
        });
    }).catch(err => {
        outputer(3, `Error occured while uploading files through SFTP: ${err}`);
        return Promise.reject(err);
    });
}

/**
 * （同步）设置Minecraft服务器的相关信息
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 */
function setMCInfo(keys, values) {
    try {
        fs.statSync(MC_SERVER_INFO_FILE_PATH); // 检查文件是否存在
    } catch (e) {
        tools.elasticWrite(MC_SERVER_INFO_FILE_PATH, '{}'); // 创建文件
    }
    jsons.scSet(MC_SERVER_INFO_FILE_PATH, keys, values);
}

/**
 * 获得Minecraft服务器的相关信息
 * @param {String} key 获取的值对应的键名，如果不传入则返回整个对象
 * @returns 对应的信息值，如果没有会返回null
 */
function getMCInfo(key = '') {
    let infoObj = jsons.scRead(MC_SERVER_INFO_FILE_PATH); // 读取包含服务器信息的对象
    if (infoObj) {
        return key ? (infoObj[key] || null) : infoObj;
    }
    return null;
}


/**
 * （同步）创建实例端临时配置文件
 * @param {Object} addOptions 要额外写入实例端配置的对象
 * @returns {Array} [实例端临时配置文件绝对路径, 实例端临时配置文件名]
 * @note 注：addOptions对象的内容会被写入实例端配置缓存中，因此只需要传入一次就够了，多传入几回倒也没影响
 */
function makeInsSideConfig(addOptions = {}) {
    // 生成长度为128的随机字符串作为实例端和本主控端连接的密匙
    INITIAL_INS_SIDE_CONFIGS['secret_key'] = tools.randStr(128);
    // 实例端状态码配置
    INITIAL_INS_SIDE_CONFIGS['env'] = Object.assign({
        'DATA_DIR': INS_DATA_DIR, // 实例端数据目录
        'PACK_DIR': INITIAL_INS_SIDE_CONFIGS['packed_server_dir'], // 服务端打包后的目录
        'MC_DIR': INITIAL_INS_SIDE_CONFIGS['mc_server_dir'] // Minecraft服务端目录
    }, cloud.environment); // cloud模块定义的环境变量（包含SECRET）
    // addOptions的配置会被加入到INITIAL_INS_SIDE_CONFIGS代表的对象中
    let options = Object.assign(INITIAL_INS_SIDE_CONFIGS, addOptions);
    tools.elasticWrite(INS_TEMP_CONFIG_FILE_PATH, JSON.stringify(options));
    return [INS_TEMP_CONFIG_FILE_PATH, INS_TEMP_CONFIG_FILE_NAME];
}

/**
 * （同步）获得用于连接SSH的密匙
 * @returns {String} 密匙字符串
 * @note 如果没有密匙，会返回空字符串
 */
function getSSHPrivateKey() {
    try {
        return fs.readFileSync(LOGIN_KEY_FILE_PATH, 'utf8');
    } catch (e) {
        return '';
    }
}

/**
 * 监听WebSocket连接是否正常
 */
function wsHeartBeat() {
    console.log('[InsSide-WS]Heartbeating...');
    // 获得最大等待时间
    let maxWaitTime = API_CONFIGS['ins_side']['ws_ping_timeout'];
    clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(() => {
        this.terminate(); // 连接失效，强制销毁连接
    }, maxWaitTime + 1000); // 多宽松一秒
}

/**
 * 和wsHeartBeat配套使用，用于终止计时器
 */
function wsTimerClear() {
    clearTimeout(this.pingTimeout);
}

/**
 * 构造实例端请求（通过WebSocket发送的数据）
 * @param {String} act 操作
 * @param {Object} data 传输的数据（默认为null
 * @returns {String} 返回JSON字符串
 * @note 之所以要写个方法，是因为主控端向实例端发送数据一定要带上密匙
 */
function buildWSReq(act, data = null) {
    let req = {
        'key': INITIAL_INS_SIDE_CONFIGS['secret_key'],
        'action': act,
        'data': data
    }
    return JSON.stringify(req);
}

/**
 * 通过SFTP创建还不存在的多级目录
 * @param {String} absPath 要检查的目录的绝对路径（一定以/开头）
 * @note 仅支持POSIX风格的分隔符
 */
function createMultiDirs(absPath) {
    let remoteIp = getInsDetail('instance_ip'), // 获得实例IP
        pathArr = absPath.split('/').filter(x => x !== ''), // 分割路径
        tasks = []; // 创建目录的Promise任务数组
    return connectInsSSH(remoteIp).then(conn => {
        return new Promise((resolve, reject) => {
            conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }
                for (let i = 0, len = pathArr.length; i < len; i++) {
                    let currentPath = `/${pathArr.slice(0, i + 1).join('/')}`;
                    tasks.push(new Promise((res, rej) => {
                        sftp.opendir(currentPath, (err, handle) => {
                            if (err) {
                                sftp.mkdir(currentPath, (err) => {
                                    if (err) {
                                        rej(err);
                                        return;
                                    }
                                    res();
                                    console.log(`Dir created: ${currentPath}`);
                                });
                            } else {
                                res();
                            }
                        })
                    }));
                }
                Promise.all(tasks)
                    .then(success => {
                        resolve();
                    })
                    .catch(err => {
                        reject(err);
                    });
            });
        }).catch(err => {
            outputer(3, `Error occured while making dirs through SFTP: ${err}`);
        }).finally(() => {
            if (conn)
                conn.end(); // 销毁SSH连接
        })
    });
}

/**
 * （异步）连接实例并返回ssh连接对象
 * @param {String} ip 实例IP，不传入会自动读取实例配置文件
 * @param {Number} retry 当前重试次数
 * @returns {Promise} resolve一个ssh2Client对象
 * @note 如果省略ip，则会尝试获取servertemp中实例的IP
 */
function connectInsSSH(ip = '', retry = 0) {
    // 最多重试连接多少次
    const maxRetry = API_CONFIGS['ssh_connect_retry'];
    let sshConn = new ssh2Client(); // 创建ssh客户端对象
    ip = ip ? ip : getInsDetail('instance_ip');
    if (!ip)
        return Promise.reject('No instance IP found.');
    return new Promise((res, rej) => {
        sshConn.on('ready', () => {
            // 连接成功
            console.log('Successfully made SSH connection.');
            res(sshConn); // 把连接传下去
        }).on('error', err => {
            rej(`[SSH]Failed to connect to the instance: ${err}`);
        }).connect({
            host: ip,
            port: 22,
            username: 'root',
            privateKey: getSSHPrivateKey(),
            readyTimeout: API_CONFIGS['ssh_ready_timeout'],
            keepaliveInterval: API_CONFIGS['ssh_keep_alive_interval']
        });
    }).catch(err => {
        // 善后处理
        sshConn.end();
        if (retry < maxRetry) {
            // 如果还没达到最大重试次数，就重试连接ssh
            retry++;
            outputer(1, `Retrying to make SSH connection...(${retry}/${maxRetry})`);
            return new Promise((res) => {
                // 3秒后重试
                setTimeout(res, 3000);
            }).then(res => {
                return connectInsSSH(ip, retry);
            });
        } else {
            // 实在无法连接上，reject
            return Promise.reject(err);
        }
    });
}


/**
 * （异步）连接实例端（通过WebSocket）
 * @param {Number} retry 重试次数(连接失败时重试)
 * @returns {Promise} resolve一个WebSocket连接实例
 * @note 连接失败会reject，而不会重试
 */
function connectInsSide(retry = 0) {
    // 最大重试连接次数
    const maxRetry = API_CONFIGS['instance_ws_connect_retry'];
    let remoteIp = getInsDetail('instance_ip'), // 获得实例IP
        remotePort = API_CONFIGS['ins_side']['ws_port']; // 获得WebSocket端口
    return ascFs.stat(INS_TEMP_CONFIG_FILE_PATH).then(res => {
        // 临时配置文件已经存在
        return Promise.resolve('done');
    }, rej => {
        // 临时配置文件不存在就创建一下，并且上传到实例端
        makeInsSideConfig();
        return connectInsSSH(remoteIp)
            .then(conn => {
                return fastPutFiles(conn, [
                    [
                        INS_TEMP_CONFIG_FILE_PATH,
                        toPosixSep(
                            path.join(INS_DATA_DIR, INS_TEMP_CONFIG_FILE_NAME)
                        )
                    ]
                ]).finally(() => {
                    if (conn)
                        conn.end(); // 销毁SSH连接
                });
            })
    }).then(success => {
        // 连接实例端
        return new Promise((res, rej) => {
            let ws = new WebSocket(`ws://${remoteIp}:${remotePort}`);
            ws.on('open', () => {
                // 连接成功
                console.log(`Successfully made WS connection: ${remoteIp}:${remotePort}`);
                wsHeartBeat.call(ws); // 激发一次心跳
                res(ws);
            }).on('error', err => {
                rej(`[WebSocket]Failed to connect to the instance side: ${err}`);
            });
        });
    }).then(ws => {
        // 连接上websocket后将本地的临时配置文件删除
        return ascFs.rm(INS_TEMP_CONFIG_FILE_PATH).then(res => {
            console.log('Deleted local temp config file.');
            return Promise.resolve(ws);
        });
    }).catch(err => {
        if (retry < maxRetry) {
            // 重试中
            retry++;
            outputer(2, `[WSReconnect]${err}, retrying...(${retry}/${maxRetry})`);
            return new Promise((res) => {
                setTimeout(res, 3000); // 3秒后重试连接
            }).then(res => {
                return connectInsSide(retry);
            });
        } else {
            return Promise.reject(err);
        }
    })
}


/**
 * 将绝对路径转换为POSIX风格
 * @param {String} origin 绝对路径 
 * @returns 新的绝对路径
 */
function toPosixSep(origin) {
    return origin.replaceAll(path.sep, '/');
}

/**
 * (同步)暂存发给Minecraft服务器的指令
 * @param {String} cmd 
 */
function storeCommand(cmd) {
    let previousCmd = jsons.scRead(MC_TEMP_CMD_FILE_PATH);
    if (!previousCmd) { // 文件尚未存在
        previousCmd = [];
    }
    previousCmd.push(cmd);
    try {
        fs.writeFileSync(MC_TEMP_CMD_FILE_PATH, JSON.stringify(previousCmd), {
            encoding: 'utf-8'
        });
    } catch (e) {
        outputer(2, `Failed to store command: ${e}`);
    }
}

/**
 * (同步)将暂存的Minecraft命令全部冲洗出来，清空暂存文件
 * @returns {Array} 包含一组Minecraft指令的数组
 */
function flushCommands() {
    let commands = jsons.scRead(MC_TEMP_CMD_FILE_PATH);
    if (!commands) { // 文件尚未存在
        commands = [];
    } else {
        fs.rmSync(MC_TEMP_CMD_FILE_PATH);
    }
    return commands;
}

module.exports = {
    updateBackendStatus,
    setStatus,
    getStatus,
    getInsDetail,
    setInsDetail,
    errorHandler,
    safeDel,
    clearServerTemp,
    terminateOOCIns,
    fastPutFiles,
    toPosixSep,
    makeInsSideConfig,
    getSSHPrivateKey,
    connectInsSSH,
    connectInsSide,
    wsHeartBeat,
    wsTimerClear,
    buildWSReq,
    createMultiDirs,
    setMCInfo,
    getMCInfo,
    storeCommand,
    flushCommands,
    recordBackup,
    backupExists,
    readBackupRecs,
    recvMCLogs,
    readMCLogs
}