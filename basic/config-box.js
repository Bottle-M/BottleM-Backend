// 存放各种配置的盒子
'use strict';
const chalk = require('chalk');
const path = require('path');
const jsons = require('./json-scaffold');

/**
 * 同步读取配置文件
 * @param {*} configName 配置文件名 
 * @returns 返回配置文件内容
 */
function configReader(configName) {
    let configFile = jsons.scRead(`./configs/${configName}`);
    if (!configFile) {
        // 这里输出错误警告要单独写
        console.log(chalk.red(`[ERROR] Config file: ${configName}.json read failed!`));
        // 配置肯定是必须要读取到的
        process.exit(1); // 退出程序
    }
    return configFile;
}

// 读取API主配置
const apiConfigs = configReader('api_configs');

// 读取用户token主配置
const tokenConfigs = configReader('user_tokens');

// 读取secret
const secretConfigs = configReader('secret_configs');

// 读取状态码信息配置
const statusConfigs = configReader('status_codes');

// backend-status文件路径
const backendStatusPath = path.join(__dirname, '../backend_status.json');

// 最初的backend-status文件内容
const initialBackendStatus = {
    status_msg: 'Everything\'s Fine', // 状态信息
    status_code: 2000, // 状态代码
    last_err: '', // 上一次错误的信息
    last_err_time: null // 上一次错误的时间
};

// 服务器临时文件存放目录
const serverTemp = 'server_data';

// instance_details实例详细信息文件路径
const insDetailsFile = path.join(__dirname, `../${serverTemp}/instance_details.json`);

// launch.lock部署锁文件路径
const launchLockFile = path.join(__dirname, `../${serverTemp}/launch.lock`);

// 实例登入私匙文件路径
const loginKeyFile = path.join(__dirname, `../${serverTemp}/login.pem`);


// 初始实例端配置内容
const initialInsSideConfigs = {
    'ws_port': apiConfigs['ins_side']
}

/**
 * 读取某个配置文件
 * @param {*} configName 配置文件名
 * @returns {Promise<any>} 返回一个Promise
 */
module.exports = {
    apiConfigs: apiConfigs, // API主配置
    tokenConfigs: tokenConfigs,
    secretConfigs: secretConfigs,
    statusConfigs: statusConfigs,
    backendStatusPath: backendStatusPath,
    initialBackendStatus: initialBackendStatus,
    serverTemp: serverTemp,
    launchLockFile: launchLockFile,
    insDetailsFile: insDetailsFile,
    loginKeyFile: loginKeyFile,
    initialInsSideConfigs: initialInsSideConfigs,
    sc: configReader,
    /**
     * 异步读取配置文件
     * @param {String} configName 读取的配置文件名
     * @returns {Promise} Promise对象
     */
    asc: async function (configName) {
        return jsons.scRead(`./configs/${configName}`).then(apiConfig => {
            return Promise.resolve(apiConfig); // 返回解析的数据
        }, rejected => {
            // 这里输出错误警告要单独写
            console.log(chalk.red(`[ERROR] Config file: ${configName}.json read failed!`));
            // 配置肯定是必须要读取到的
            process.exit(1); // 退出程序
        })
    }
}