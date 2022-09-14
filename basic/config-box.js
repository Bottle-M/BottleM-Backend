// 存放各种配置的盒子
'use strict';
const chalk = require('chalk');
const path = require('path');
const jsons = require('./json-scaffold');
// 配置文件所在目录
const CONFIG_DIR = path.join(__dirname, '..', './configs');

/**
 * 同步读取配置文件
 * @param {String} configName 配置文件名 
 * @returns 返回配置文件内容
 */
function configReader(configName) {
    let configFile = jsons.scRead(
        path.join(CONFIG_DIR, `${configName}.json`)
    );
    if (!configFile) {
        // 这里输出错误警告要单独写
        console.log(chalk.red(`[ERROR] Config file: ${configName}.json read failed!`));
        // 配置肯定是必须要读取到的
        process.exit(1); // 退出程序
    }
    return configFile;
}

// 读取API主配置
const API_CONFIGS = configReader('api_configs');

// 读取用户token主配置
const TOKEN_CONFIGS = configReader('user_tokens');

// 读取secret
const SECRET_CONFIGS = configReader('secret_configs');

// 读取状态码信息配置
const STATUS_CONFIGS = configReader('status_codes');

// backend-status文件路径
const BACK_END_STATUS_FILE_PATH = path.join(__dirname, '../backend_status.json');

// 最初的backend-status文件内容
const INITIAL_BACKEND_STATUS = {
    status_msg: 'Everything\'s Fine', // 状态信息
    status_code: 2000, // 状态代码
    err_from: null, // 错误来源'insside'/'backend'
    last_err: '', // 上一次错误的信息
    last_err_time: null // 上一次错误的时间
};

// 服务器临时文件存放目录
const SERVER_TEMP_DIR = 'server_data';

// instance_details实例详细信息文件路径
const INS_DETAILS_FILE_PATH = path.join(__dirname, `../${SERVER_TEMP_DIR}/instance_details.json`);

// launch.lock部署锁文件路径
const LAUNCH_LOCK_FILE_PATH = path.join(__dirname, `../${SERVER_TEMP_DIR}/launch.lock`);

// 实例登入私匙文件路径
const LOGIN_KEY_FILE_PATH = path.join(__dirname, `../${SERVER_TEMP_DIR}/login.pem`);

// 临时储存发送到Minecraft服务器指令的文件路径
const MC_TEMP_CMD_FILE_PATH = path.join(__dirname, `../cmds_for_minecraft.json`);

// 所有必要数据上传到实例中的哪里（绝对路径）
const DATA_DIR = API_CONFIGS['ins_side']['data_dir'];

module.exports = {
    apiConfigs: API_CONFIGS, // API主配置
    tokenConfigs: TOKEN_CONFIGS,
    secretConfigs: SECRET_CONFIGS,
    statusConfigs: STATUS_CONFIGS,
    backendStatusPath: BACK_END_STATUS_FILE_PATH,
    initialBackendStatus: INITIAL_BACKEND_STATUS,
    serverTempDir: SERVER_TEMP_DIR,
    launchLockPath: LAUNCH_LOCK_FILE_PATH,
    insDetailsPath: INS_DETAILS_FILE_PATH,
    loginKeyPath: LOGIN_KEY_FILE_PATH,
    insDataDir: DATA_DIR,
    mcTempCmdPath: MC_TEMP_CMD_FILE_PATH,
    sc: configReader,
    /**
     * 异步读取配置文件
     * @param {String} configName 读取的配置文件名
     * @returns {Promise} Promise对象
     */
    asc: async function (configName) {
        return jsons.ascRead(
            path.join(CONFIG_DIR, `${configName}.json`)
        ).then(apiConfig => {
            return Promise.resolve(apiConfig); // 返回解析的数据
        }, rejected => {
            // 这里输出错误警告要单独写
            console.log(chalk.red(`[ERROR] Config file: ${configName}.json read failed!`));
            // 配置肯定是必须要读取到的
            process.exit(1); // 退出程序
        })
    }
}