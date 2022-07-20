// 存放各种配置的盒子
'use strict';
const chalk = require('chalk');
const path = require('path');
const jsonReader = require(path.join(__dirname, './json-reader'));

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
    sc: configReader,
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