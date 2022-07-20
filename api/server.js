// 服务器相关API
'use strict';
const chalk = require('chalk');
const { createCipheriv } = require('crypto');
const { promises: fs, statSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');
// 服务器临时文件存放目录
const serverTemp = 'server_data';

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

async function serverDeploy() {
    
}

module.exports = {
    launch: function (resultObj) {
        // launch.lock这个文件存在则代表服务器已经部署
        let lockFile = path.join(__dirname, `../${serverTemp}/launch.lock`);
        try {
            // 检查是否有launch.lock文件
            statSync(lockFile);
            resultObj.msg = 'Server Already Launched';
        } catch (e) {
            // 创建launch.lock文件
            elasticWrite(lockFile, `Launched at ${new Date().toISOString()}`);
            resultObj.msg = 'Starting to deploy the server!';
            resultObj.code = 0; // 0 代表交由异步处理
        }
        return resultObj;
    }
}