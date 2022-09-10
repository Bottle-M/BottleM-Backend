// server.js中常用的工具
'use strict';
const fs = require('fs');
const ascFs = fs.promises;
const chalk = require('chalk');
const path = require('path');
const cloud = require('./qcloud');
const configs = require('../basic/config-box');
const apiConfigs = configs['apiConfigs'];
const jsons = require('../basic/json-scaffold');
const outputer = require('../basic/output');
const {
    backendStatusFile: backendStatusPath,
    insDetailsFile: insDetailsFilePath,
    launchLockFile: lockFilePath,
    mcTempCmdFile: mcTempCmdFilePath,
    serverTemp: serverTempPath
} = configs;
const WebSocket = require('ws');
const ssh2Client = require('ssh2').Client;
// 实例端最初配置对象
const initialInsSideConfigs = apiConfigs['ins_side'];
// 实例端临时配置的文件名（如果这一项改了，InsSide的源码也要改）
const insTempConfigName = 'ins_side_configs.tmp.json';
// 实例端临时配置的绝对路径
const insTempConfigPath = path.join(__dirname, `../${serverTempPath}/${insTempConfigName}`);
// Minecraft服务器信息文件的绝对路径
const minecraftServerInfoPath = path.join(__dirname, `../${serverTempPath}/mc_server_info.json`);
// 增量备份文件记录数据
const backupRecordPath = path.join(__dirname, `../${serverTempPath}/backup_records.json`);
// 所有必要数据上传到实例中的哪里（绝对路径）
const remoteDir = configs['remoteDir'];

// 检查backend_status状态记录文件是否存在
try {
    fs.statSync(backendStatusPath);
} catch (e) {
    // 不存在就创建一个
    fs.writeFileSync(backendStatusPath, JSON.stringify(configs['initialBackendStatus']), {
        encoding: 'utf8'
    });
}

/**
 * （同步）检查记录增量备份的文件是否存在
 * @returns {Boolean}
 */
function backupExists() {
    try {
        fs.statSync(backupRecordPath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * （同步）记录增量备份的文件
 * @param {Array} data 文件信息数组
 * @param {Boolean} invoke 是否删除（抛弃增量备份）
 */
function recordBackup(data, invoke = false) {
    try {
        if (invoke) {
            fs.rmSync(backupRecordPath);
        } else {
            fs.writeFileSync(backupRecordPath, JSON.stringify(data), {
                encoding: 'utf8'
            });
        }
    } catch (e) {
        outputer(2, `Failed to record backup: ${e}`);
    }
}

/**
 * （异步）设置backend_status状态文件
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 * @returns {Promise}
 */
function updateBackendStatus(keys, values) {
    return jsons.ascSet(backendStatusPath, keys, values).catch(err => {
        // 设置状态失败，写入日志
        let errMsg = 'Failed to set status: ' + err;
        outputer(2, errMsg);
        return Promise.reject(errMsg);
    });
}


/**
 * （异步）根据状态代号设置状态信息
 * @param {Number} code 
 * @returns {Promise}
 */
function setStatus(code) {
    // 获得对应状态码的配置
    let corresponding = configs['statusConfigs'][code],
        msg = corresponding['msg'],
        inform = corresponding['inform'];
    outputer(1, msg);
    return updateBackendStatus(['status_msg', 'status_code'], [msg, code]);
}

/**
 * （异步）设置InstanceDetail文件
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 * @returns {Promise}
 */
function setInsDetail(keys, values) {
    return jsons.ascSet(insDetailsFilePath, keys, values).catch(err => {
        // 设置状态失败，写入日志
        let errMsg = 'Failed to set Instance Detail: ' + err;
        outputer(2, errMsg);
        return Promise.reject(errMsg);
    });
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
    let status = jsons.scRead(backendStatusPath);
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
    let details = jsons.scRead(insDetailsFilePath);
    if (details) {
        return key ? details[key] : details;
    } else {
        return null;
    }
}

/**
 * （同步）删除文件，不会抛出错误
 * @param {*} filePath 文件路径
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
 */
function clearServerTemp() {
    try {
        let files = fs.readdirSync(serverTempPath);
        files.forEach((tmp) => {
            // 排除增量备份记录文件，这个是额外删除的
            if (!tmp === backupRecordPath)
                fs.rmSync(path.join(__dirname, `../${serverTempPath}`, tmp));
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
 * @param {Number} time 日志时间戳（不指定则自动获取当前时间）
 */
function errorHandler(msg, time = 0) {
    // 错误信息
    let errMsg = `Fatal:${msg}`,
        errTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }); // 错误发生的时间
    jsons.ascRead(backendStatusPath).then(parsed => {
        let currentCode = Number(parsed['status_code']),
            topDigitDiff = Math.floor(currentCode / 1000) - 1,// 代号最高位数字差
            errCode = currentCode - topDigitDiff * 1000;// 减去最高位数字差
        // 特殊处理2000对应的错误: 1000错误代表没有合适的实例
        if (errCode === 1000) {
            // 输出错误，记入日志，等级：警告
            outputer(2, errMsg, true, time);
            // 删除部署锁定文件
            safeDel(lockFilePath);
        } else {
            // 输出错误，记入日志，等级：错误
            outputer(3, errMsg, true, time);
            // 标记状态：错误
            updateBackendStatus(['status_msg', 'status_code', 'last_err', 'last_err_time'], [errMsg, errCode, errMsg, errTime]);
        }
    }).catch(err => {
        outputer(3, `Error occurred while handling ERROR:${err}`, false);
    });
}

/**
 * （同步）写入文件（自动创建目录）
 * @param {String} filePath 文件路径
 * @param {String} data 写入的数据
 * @returns {Boolean} 布尔值，代表是否成功
 */
function elasticWrite(filePath, data) {
    let dirPath = path.dirname(filePath); // 获得文件目录
    try {
        fs.statSync(dirPath); // 检查目录是否存在
    } catch (e) {
        fs.mkdirSync(dirPath, { recursive: true }); // 创建目录
    }
    try {
        fs.writeFileSync(filePath, data, {
            encoding: 'utf8'
        });
    } catch (e) {
        // 创建文件失败
        console.log(chalk.red(`[ERROR] Failed to write file ${filePath}: ${e}`));
        return false;
    }
    return true;
}

/**
 * 生成一定长度的随机字符串
 * @param {Number} len 
 * @returns {String} 随机字符串
 */
function randStr(len) {
    let charList = 'ABCDEYZ$abcdefFGH#STUVWXghijk_lmnIJKLMNOPQR*opqr$stuvw_xy#z0123456*789',
        charNum = charList.length,
        finalStr = ''; // 结果字符串
    for (let i = 0; i < len; i++) {
        // 因为JavaScript随机数是伪随机，这里尽量使其更难以摸透
        let randTimes = Math.floor(Math.random() * 6) + 1,
            result = 0;
        for (let j = 0; j < randTimes; j++) {
            result = Math.floor(Math.random() * charNum);
        }
        finalStr += charList[result];
    }
    return finalStr;
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
        fs.statSync(minecraftServerInfoPath); // 检查文件是否存在
    } catch (e) {
        elasticWrite(minecraftServerInfoPath, JSON.stringify({
            'players_online': 0
        })); // 创建文件
    }
    jsons.scSet(minecraftServerInfoPath, keys, values);
}

/**
 * 获得Minecraft服务器的相关信息
 * @param {String} key 获取的值对应的键名
 * @returns 对应的信息值
 */
function getMCInfo(key) {
    let infoObj = jsons.scRead(minecraftServerInfoPath); // 读取包含服务器信息的对象
    return infoObj[key];
}


/**
 * （同步）创建实例端临时配置文件
 * @param {Object} options 要写入实例端配置的对象
 * @returns {Array} [实例端临时配置文件绝对路径, 实例端临时配置文件名]
 */
function makeInsSideConfig(options = {}) {
    // 生成长度为128的随机字符串作为实例端和本主控端连接的密匙
    initialInsSideConfigs['secret_key'] = randStr(128);
    // 实例端状态码配置
    initialInsSideConfigs['env'] = Object.assign({
        'DATA_DIR': remoteDir, // 实例端数据目录
        'PACK_DIR': initialInsSideConfigs['packed_server_dir'], // 服务端打包后的目录
        'FRAGMENTS_DIR': initialInsSideConfigs['backup_fragments_dir'], // 增量备份碎片目录
        'MC_DIR': initialInsSideConfigs['mc_server_dir'] // Minecraft服务端目录
    }, cloud.environment); // cloud模块定义的环境变量（包含SECRET）
    options = Object.assign(options, initialInsSideConfigs);
    elasticWrite(insTempConfigPath, JSON.stringify(options));
    return [insTempConfigPath, insTempConfigName];
}

/**
 * 获得目前连接实例端WebSocket的密匙
 * @returns {String} 
 */
function getInsSideKey() {
    return initialInsSideConfigs['secret_key'];
}

/**
 * （异步）连接实例并返回ssh连接对象
 * @param {String} ip 实例IP
 * @returns {Promise} resolve一个ssh2Client对象
 * @note 如果省略ip，则会尝试获取servertemp中实例的IP
 */
function connectInsSSH(ip = '') {
    let sshConn = new ssh2Client(), // 创建ssh客户端对象
        keyFilePath = configs['loginKeyFile']; // 服务器登录密匙文件
    ip = ip ? ip : getInsDetail('instance_ip');
    if (!ip)
        return Promise.reject('No instance IP found.');
    return new Promise((res, rej) => {
        sshConn.on('ready', () => {
            // 连接成功
            console.log('Successfully connected to the instance.');
            res(sshConn); // 把连接传下去
        }).on('error', err => {
            rej(`Failed to connect to the instance: ${err}`);
        }).connect({
            host: ip,
            port: 22,
            username: 'root',
            privateKey: fs.readFileSync(keyFilePath, 'utf8'),
            readyTimeout: apiConfigs['ssh_ready_timeout'],
            keepaliveInterval: apiConfigs['ssh_keep_alive_interval']
        });
    }).catch(err => {
        // 善后处理
        sshConn.end();
        return Promise.reject(err);
    });
}

/**
 * 监听WebSocket连接是否正常
 */
function wsHeartBeat() {
    console.log('ping');
    // 获得最大等待时间
    let maxWaitTime = apiConfigs['ins_side']['ws_ping_timeout'];
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
 */
function buildInsSideReq(act, data = null) {
    let req = {
        'key': initialInsSideConfigs['secret_key'],
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
        })
    });
}

/**
 * （异步）连接实例端（通过WebSocket）
 * @returns {Promise} resolve一个WebSocket连接实例
 */
function connectInsSide() {
    let remoteIp = getInsDetail('instance_ip'), // 获得实例IP
        remotePort = apiConfigs['ins_side']['ws_port']; // 获得WebSocket端口
    return ascFs.stat(insTempConfigPath).then(res => {
        // 临时配置文件已经存在
        return Promise.resolve('done');
    }, rej => {
        // 临时配置文件不存在就创建一下，并且上传到实例端
        makeInsSideConfig();
        return connectInsSSH(remoteIp)
            .then(conn => {
                return fastPutFiles(conn, [
                    [
                        insTempConfigPath,
                        toPosixSep(
                            path.join(remoteDir, insTempConfigName)
                        )
                    ]
                ]);
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
                rej(`Failed to connect to the instance side: ${err}`);
            });
        });
    }).then(ws => {
        // 连接上websocket后将本地的临时配置文件删除
        return ascFs.rm(insTempConfigPath).then(res => {
            console.log('Deleted local temp config file.');
            return Promise.resolve(ws);
        });
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
    let previousCmd = jsons.scRead(mcTempCmdFilePath);
    if (!previousCmd) { // 文件尚未存在
        previousCmd = [];
    }
    previousCmd.push(cmd);
    try {
        fs.writeFileSync(mcTempCmdFilePath, JSON.stringify(previousCmd), {
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
    let commands = jsons.scRead(mcTempCmdFilePath);
    if (!commands) { // 文件尚未存在
        commands = [];
    } else {
        fs.rmSync(mcTempCmdFilePath);
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
    elasticWrite,
    clearServerTemp,
    terminateOOCIns,
    randStr,
    fastPutFiles,
    toPosixSep,
    makeInsSideConfig,
    getInsSideKey,
    connectInsSSH,
    connectInsSide,
    wsHeartBeat,
    wsTimerClear,
    buildInsSideReq,
    createMultiDirs,
    setMCInfo,
    getMCInfo,
    storeCommand,
    flushCommands,
    recordBackup,
    backupExists
}