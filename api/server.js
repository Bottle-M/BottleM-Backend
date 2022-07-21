// 服务器相关API
'use strict';
const chalk = require('chalk');
const { promises: fs, statSync, writeFileSync, mkdirSync } = require('fs');
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
function setStatus(keys, values) {
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
 * 发生错误时进行的工作
 * @param {String} msg 错误信息
 */
function errorHandler(msg) {
    // 错误信息
    let errMsg = `Fatal:${msg}`;
    // 输出错误，记入日志
    outputer(3, errMsg);
    jsonReader.asc(configs.backendStatusPath).then(parsed => {
        let currentCode = Number(parsed['status_code']),
            topDigitDiff = Math.floor(currentCode / 1000) - 1,// 代号最高位数字差
            errCode = currentCode - topDigitDiff * 1000;// 减去最高位数字差
        // 标记状态：错误
        setStatus(['status_msg', 'status_code', 'last_err'], [errMsg, errCode, errMsg]);
    }).catch(err => {
        outputer(3, `Error occurred while handling ERROR:${e}`, false);
    });
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
    setStatus(['status_msg', 'status_code'], ['Getting InstanceFamily...', 2001]);
    outputer(1, 'Getting InstanceFamily...');
    return instance.filterFamily('').then(families => {
        console.log(families);
    })
        .catch(e => {
            // 发生错误
            errorHandler(e);
            return Promise.reject('failed');
        })
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
                    outputer(3, 'Fatal Error Occurred.');
                });
            resultObj.msg = 'Starting to deploy the server!';
            resultObj.code = 0; // 0 代表交由异步处理
        }
        return resultObj;
    }
}