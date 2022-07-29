// server.js中常用的工具
'use strict';
const fs = require('fs');
const ascFs = fs.promises;
const chalk = require('chalk');
const path = require('path');
const cloud = require('./qcloud');
const configs = require('../basic/config-box');
const jsons = require('../basic/json-scaffold');
const outputer = require('../basic/output');
const backendStatusPath = configs['backendStatusPath'];
const insDetailsFile = configs['insDetailsFile'];
const serverTemp = configs['serverTemp'];

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
    return jsons.ascSet(insDetailsFile, keys, values).catch(err => {
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
    let insId = getInsDetail('ins_id'),
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
    let details = jsons.scRead(insDetailsFile);
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
function cleanServerTemp() {
    try {
        let files = fs.readdirSync(serverTemp);
        files.forEach((tmp) => {
            fs.rmSync(path.join(__dirname, `../${serverTemp}`, tmp));
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
 */
function errorHandler(msg) {
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
            outputer(2, errMsg);
            // 删除部署锁定文件
            safeDel(lockFile);
        } else {
            // 输出错误，记入日志，等级：错误
            outputer(3, errMsg);
            // 标记状态：错误
            updateBackendStatus(['status_msg', 'status_code', 'last_err', 'last_err_time'], [errMsg, errCode, errMsg, errTime]);
        }
    }).catch(err => {
        outputer(3, `Error occurred while handling ERROR:${err}`, false);
    });
}

/**
 * （同步）写入文件（自动创建目录）
 * @param {*} filePath 文件路径
 * @param {*} data 写入的数据
 * @returns 布尔值，代表是否成功
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
 * 将绝对路径转换为POSIX风格
 * @param {String} origin 绝对路径 
 * @returns 新的绝对路径
 */
function toPosixSep(origin) {
    return origin.replaceAll(path.sep, '/');
}

module.exports = {
    updateBackendStatus: updateBackendStatus,
    setStatus: setStatus,
    getStatus: getStatus,
    getInsDetail: getInsDetail,
    setInsDetail: setInsDetail,
    errorHandler: errorHandler,
    safeDel: safeDel,
    elasticWrite: elasticWrite,
    cleanServerTemp: cleanServerTemp,
    terminateOOCIns: terminateOOCIns,
    randStr: randStr,
    fastPutFiles: fastPutFiles,
    toPosixSep: toPosixSep
}