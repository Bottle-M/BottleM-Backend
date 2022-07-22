// 服务器相关API
'use strict';
const chalk = require('chalk');
const { promises: fs, statSync, writeFileSync, mkdirSync, rmSync } = require('fs');
const path = require('path');
const configs = require('../basic/config-box');
const instance = require('./qcloud');
const outputer = require('../basic/output');
const jsonReader = require('../basic/json-reader');
// 服务器临时文件存放目录
const serverTemp = 'server_data';
// launch.lock这个文件存在则代表服务器已经部署
const lockFile = path.join(__dirname, `../${serverTemp}/launch.lock`);

/**
 * 设置backend_status状态文件
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 */
function updateBackendStatus(keys, values) {
    if (!(keys instanceof Array)) keys = [keys];
    if (!(values instanceof Array)) values = [values];
    jsonReader.asc(configs.backendStatusPath).then(parsed => {
        for (let i = 0, len = keys.length; i < len; i++) {
            parsed[keys[i]] = values[i];
        }
        return fs.writeFile(configs.backendStatusPath, JSON.stringify(parsed));
    }).catch(err => {
        // 设置状态失败，写入日志
        outputer(2, 'Failed to set status: ' + err);
    });
}

/**
 * 根据状态代号设置状态信息
 * @param {Number} code 
 */
function setStatus(code) {
    // 获得对应状态码的配置
    let corresponding = configs['statusConfigs'][code],
        msg = corresponding['msg'],
        inform = corresponding['inform'];
    updateBackendStatus(['status_msg', 'status_code'], [msg, code]);
    outputer(1, msg);
}

/**
 * 发生错误时进行的工作
 * @param {String} msg 错误信息
 */
function errorHandler(msg) {
    // 错误信息
    let errMsg = `Fatal:${msg}`,
        errTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }); // 错误发生的时间
    jsonReader.asc(configs.backendStatusPath).then(parsed => {
        let currentCode = Number(parsed['status_code']),
            topDigitDiff = Math.floor(currentCode / 1000) - 1,// 代号最高位数字差
            errCode = currentCode - topDigitDiff * 1000;// 减去最高位数字差
        if (errCode === 1001) {
            // 输出错误，记入日志，等级：警告
            outputer(2, errMsg);
            // 特殊处理2001对应的错误, 1001错误代表没有合适的实例
            setStatus(2000);
            // 删除部署锁定文件
            elasticDel(lockFile);
        } else {
            // 输出错误，记入日志，等级：错误
            outputer(3, errMsg);
            // 标记状态：错误
            updateBackendStatus(['status_msg', 'status_code', 'last_err', 'last_err_time'], [errMsg, errCode, errMsg, errTime]);
        }
    }).catch(err => {
        outputer(3, `Error occurred while handling ERROR:${e}`, false);
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
 * 开始部署服务器（主入口）
 * @return {Promise} res/rej 服务器是/否部署成功
 */
function serverDeploy() {
    setStatus(2001); // 开始比价
    return instance.filterInsType().then(types => {
        types.sort((former, latter) => { // 根据价格、内网带宽进行排序
            // 计算权重数：先把折扣价*1000，减去内网带宽*20。数值越小，权重越大
            let formerWeight = former['Price']['UnitPriceDiscount'] * 1000 - former['InstanceBandwidth'] * 20,
                latterWeight = latter['Price']['UnitPriceDiscount'] * 1000 - latter['InstanceBandwidth'] * 20;
            return formerWeight - latterWeight;
        });
        if (types.length <= 0) {
            // 没有可用的实例
            return Promise.reject('No available instance (that meet the specified configuration)');
        }
        console.log(types);
    });
    // rejected留给外面处理
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
            serverDeploy() // 交由异步函数处理
                .catch(e => {
                    errorHandler(e);
                });
            resultObj.msg = 'Starting to deploy the server!';
            resultObj.code = 0; // 0 代表交由异步处理
        }
        return resultObj;
    }
}