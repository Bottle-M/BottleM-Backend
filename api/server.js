// 服务器相关API
'use strict';
const chalk = require('chalk');
const { promises: fs, statSync, writeFileSync, mkdirSync, rmSync } = require('fs');
const path = require('path');
const configs = require('../basic/config-box');
const cloud = require('./qcloud');
const outputer = require('../basic/output');
const jsons = require('../basic/json-scaffold');
// 服务器临时文件存放目录
const serverTemp = 'server_data';
// launch.lock这个文件存在则代表服务器已经部署
const lockFile = path.join(__dirname, `../${serverTemp}/launch.lock`);
// login.pem，服务器登录密匙文件
const keyFile = path.join(__dirname, `../${serverTemp}/login.pem`);
// instance_details实例详细信息
const insDetailsFile = path.join(__dirname, `../${serverTemp}/instance_details.json`);

/**
 * 设置backend_status状态文件
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 * @returns {Promise}
 */
function updateBackendStatus(keys, values) {
    return jsons.ascSet(configs['backendStatusPath'], keys, values).catch(err => {
        // 设置状态失败，写入日志
        let errMsg = 'Failed to set status: ' + err;
        outputer(2, errMsg);
        return Promise.reject(errMsg);
    });
}

/**
 * 根据状态代号设置状态信息
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
 * 发生错误时进行的工作
 * @param {String} msg 错误信息
 */
function errorHandler(msg) {
    // 错误信息
    let errMsg = `Fatal:${msg}`,
        errTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }); // 错误发生的时间
    jsons.ascRead(configs.backendStatusPath).then(parsed => {
        let currentCode = Number(parsed['status_code']),
            topDigitDiff = Math.floor(currentCode / 1000) - 1,// 代号最高位数字差
            errCode = currentCode - topDigitDiff * 1000;// 减去最高位数字差
        // 特殊处理2000对应的错误: 1000错误代表没有合适的实例
        if (errCode === 1000) {
            // 输出错误，记入日志，等级：警告
            outputer(2, errMsg);
            // 删除部署锁定文件
            elasticDel(lockFile);
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
 * （同步）删除文件，不会抛出错误
 * @param {*} filePath 文件路径
 */
function elasticDel(filePath) {
    try {
        rmSync(filePath);
    } catch (e) {
        console.log(`Unable to remove file: ${filePath}`);
    }
}

/**
 * 写入文件（自动创建目录）
 * @param {*} filePath 文件路径
 * @param {*} data 写入的数据
 * @returns 布尔值
 */
function elasticWrite(filePath, data) {
    let dirPath = path.dirname(filePath); // 获得文件目录
    try {
        statSync(dirPath); // 检查目录是否存在
    } catch (e) {
        mkdirSync(dirPath, { recursive: true }); // 创建目录
    }
    try {
        writeFileSync(filePath, data, {
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
 * 比价，然后创建实例
 * @return {Promise} resolve创建的实例ID
 * @note 这是第一个环节
 */
function compareAndRun() {
    setStatus(2001); // 开始比价
    return cloud.filterInsType().then(insConfigs => {
        insConfigs.sort((former, latter) => { // 根据价格、内网带宽进行排序
            // 计算权重数：先把折扣价*1000，减去内网带宽*20。数值越小，权重越大
            let formerWeight = former['Price']['UnitPriceDiscount'] * 1000 - former['InstanceBandwidth'] * 20,
                latterWeight = latter['Price']['UnitPriceDiscount'] * 1000 - latter['InstanceBandwidth'] * 20;
            return latterWeight - formerWeight; // 降序，这样后面直接pop就行
        });
        if (insConfigs.length <= 0) {
            // 设置状态码为2000，触发错误1000
            return setStatus(2000).then(res => {
                // 没有可用的实例
                return Promise.reject('No available instance (that meet the specified configuration)');
            }); // 同样是rejected留给外面处理
        }
        return Promise.resolve(insConfigs);
        // rejected留给外面处理
    }).then(insConfigs => {
        setStatus(2002); // 生成密匙对
        return cloud.generateKey().then(keyObj => {
            // 写入密钥文件
            return fs.writeFile(keyFile, keyObj['privateKey'], {
                encoding: 'utf8'
            }).then(res => {
                // 把keyId传下去，在创建实例的时候可以直接绑定
                return Promise.resolve([insConfigs, keyObj['keyId']]);
            })
        });
    }).then(configsAndKey => {
        setStatus(2003); // 创建实例
        let [insConfigs, keyId] = configsAndKey;
        return cloud.createInstance(insConfigs, keyId).then(insId => {
            let detailedData = {
                instance_id: insId,
                instance_key_id: keyId
            };
            return fs.writeFile(insDetailsFile, JSON.stringify(detailedData), {
                encoding: 'utf8'
            }).then(res => {
                return Promise.resolve(insId); // 将实例ID传入下一个环节
            });
        });
    })
}

/**
 * 建立“基地”（在创建的实例上）
 * @param {string} insId 实例ID
 * @return {Promise} 
 * @note 这是第二个环节
 */
function setUpBase(insId) {
    let timer = null;
    return new Promise((res, rej) => {
        setStatus(2100); // 等待实例开始运行
        timer = setInterval(() => {
            // 每5秒查询一次服务器是否已经启动
            cloud.describeInstance(insId).then(insInfo => {
                //  实例已经启动，可以进行连接
                if (insInfo['InstanceState'] === 'RUNNING') {
                    // 清理计时器（这里不用finally是因为可能后续请求执行完前不会执行finally中的代码）
                    clearTimeout(timer);
                    let pubIp = insInfo['PublicIpAddresses'][0];
                    if (!pubIp) {
                        return Promise.reject('No public ip address');
                    }
                    // 将公网IP写入instance_details
                    return jsons.ascSet(insDetailsFile, 'instance_ip', pubIp).then(success => {
                        return Promise.resolve(pubIp);
                    });
                }
            }).then(pubIp => {
                res(pubIp);
            }).catch(err => {
                clearTimeout(timer);
                rej(err);
            });
        }, 5000);
    }).then((pubIp) => {
        setStatus(2101); // 尝试通过SSH连接实例
        
    });
}

module.exports = {
    /**
     * 部署/启动服务器（会检查服务器是否已经启动）
     * @param {*} resultObj 返回数据对象
     * @returns 装有返回数据的对象
     */
    launch: function (resultObj) {
        try {
            // 检查是否有launch.lock文件
            statSync(lockFile);
            resultObj.msg = 'Server Already Launched';
        } catch (e) {
            // 创建launch.lock文件
            elasticWrite(lockFile, `Launched at ${new Date().toISOString()}`);
            compareAndRun() // 交由异步函数处理
                .then(insId => {
                    // 开始在实例上建设“基地”
                    return setUpBase(insId);
                })
                .catch(err => {
                    errorHandler(err);
                });
            resultObj.msg = 'Starting to deploy the server!';
            resultObj.code = 0; // 0 代表交由异步处理
        }
        return resultObj;
    }
}