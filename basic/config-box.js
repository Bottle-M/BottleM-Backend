// 存放各种配置的盒子
'use strict';
const chalk = require('chalk');
const path = require('path');
const jsonReader = require('./json-reader');

/**
 * 同步读取配置文件
 * @param {*} configName 配置文件名 
 * @returns 返回配置文件内容
 */
function configReader(configName) {
    let configFile = jsonReader.sc(`./configs/${configName}`);
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


/**
 * 读取某个配置文件
 * @param {*} configName 配置文件名
 * @returns {Promise<any>} 返回一个Promise
 */
module.exports = {
    apiConfigs: apiConfigs, // API主配置
    tokenConfigs: tokenConfigs,
    secretConfigs: secretConfigs,
    backendStatusPath: path.join(__dirname, '../backend_status.json'), // backend-status文件名
    initialBackendStatus: {
        status_msg: 'Everything\'s Fine', // 状态信息
        status_code: 2000, // 状态代码
        last_err: '' // 上一次错误的信息
    }, // 最初的backend-status文件内容
    sc: configReader,
    /**
     * 异步读取配置文件
     * @param {String} configName 读取的配置文件名
     * @returns {Promise} Promise对象
     */
    asc: async function (configName) {
        return jsonReader.sc(`./configs/${configName}`).then(apiConfig => {
            return Promise.resolve(apiConfig); // 返回解析的数据
        }, rejected => {
            // 这里输出错误警告要单独写
            console.log(chalk.red(`[ERROR] Config file: ${configName}.json read failed!`));
            // 配置肯定是必须要读取到的
            process.exit(1); // 退出程序
        })
    }
}