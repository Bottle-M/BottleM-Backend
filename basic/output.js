// 控制台消息输出模块（同时会记录日志）
'use strict';
const { promises: fs, statSync, mkdirSync, writeFileSync } = require('fs');
const chalk = require('chalk');
const path = require('path');
// 载入配置
const API_CONFIGS = require('./config-box')['apiConfigs'];
// 从配置中获得日志绝对目录（默认为./api_logs）
const LOG_DIR = path.join(__dirname, '..', API_CONFIGS['logs_dir'] || './api_logs');
// .logstatus日志状态文件
const STATUS_FILE_PATH = path.join(LOG_DIR, '.logstatus');

try {
    // 检查日志目录是否创建
    statSync(LOG_DIR);
} catch (e) {
    // 创建日志目录
    try {
        console.log('Creating Directory for logs.');
        mkdirSync(LOG_DIR);
        console.log('Directory for logs created.');
    } catch (e) {
        // 创建目录失败
        console.log(chalk.red(`[ERROR] Creating Directory for logs failed: ${e}`));
        process.exit(1);
    }
}

try {
    // 检查有没有lognum文件(存放日志数量和行数)
    statSync(STATUS_FILE_PATH);
} catch (e) {
    // 不存在该文件，写入初始数据0 0（目前的行数，日志数量）
    try {
        writeFileSync(STATUS_FILE_PATH, '0 0', {
            encoding: 'utf8',
            flag: 'w'
        });
        console.log('.logstatus created.');
    } catch (e) {
        // .logstatus文件写入失败
        console.log(chalk.red(`[ERROR] Creating .logstatus failed: ${e}`));
        process.exit(1);
    }
}

/**
 * 将日志写入文件
 * @param {String} log 待写入内容 
 * @param {Number} time 日志时间戳（不指定则自动获取当前时间）
 */
function writeLogs(log, time = 0) {
    let currentLog = path.join(LOG_DIR, 'latest.log'), // 当前日志文件
        currentDate = time ? new Date(time) : new Date();
    // 读取日志状态文件
    fs.readFile(STATUS_FILE_PATH, { encoding: 'utf8' }).then(async (res) => {
        let [lineNum, logsNum] = res.split(' '); // 获得行数和日志数量
        let overflowed = 0; // 超出的日志数量
        if (Number(lineNum) >= API_CONFIGS['rows_per_log']) { // latest日志行数超过指定行数
            try {
                logsNum = Number(logsNum) + 1; // 日志储存数量加1
                if ((overflowed = Number(logsNum) - API_CONFIGS['max_logs_retained']) > 0) { // 防止日志数量超出
                    logsNum = API_CONFIGS['max_logs_retained'];
                }
                // 把当前的latest.log重命名为 时间戳.old.log
                await fs.rename(currentLog, path.join(LOG_DIR, `${currentDate.getTime()}.old.log`));
                lineNum = 0; // 行数归零
                // 写入.logstatus
                await fs.writeFile(STATUS_FILE_PATH, `${lineNum} ${logsNum}`, {
                    encoding: 'utf8',
                    flag: 'w'
                });
            } catch (e) {
                // 出现问题，直接reject
                return Promise.reject(e);
            }
        }
        if (overflowed > 0) { // 保留的日志数量超过配置数量
            // 扫描当前的日志目录
            fs.readdir(LOG_DIR).then((res) => {
                // 按时间升序排序
                res = res.filter(item => item.includes('.old')); // 过滤日志格式
                res.sort((a, b) => {
                    let formerStamp = Number(a.split('.old')[0]), // 前一个日志的时间戳
                        latterStamp = Number(b.split('.old')[0]); // 后一个日志的时间戳
                    return formerStamp - latterStamp; // 按时间戳升序排序，把最早的排在前面
                });
                let forDeletion = res.slice(0, overflowed); // 要删除的日志
                forDeletion.forEach(async (file) => {
                    // 删除日志
                    await fs.rm(path.join(LOG_DIR, file), {
                        force: true
                    });
                    output(1, `Deleted log: ${file}`, false);
                });
            }, rej => {
                output(3, `Fail to delete ${overflowed} log files`, false);
            });
        }
        return Promise.resolve([lineNum, logsNum]); // 把行数传下去
    }, rej => {
        // 没有读取到，报错
        output(3, 'Failed to read .logstatus', false);
        return Promise.reject(rej);
    }).then(logStatus => {
        // 一切正常，写入日志
        let dateStr = currentDate.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            [lineNum, logsNum] = logStatus;
        fs.appendFile(currentLog, `[${dateStr}]${log}\n`, {
            encoding: 'utf8',
            flag: 'a'
        }).then(res => {
            // 行数增加
            lineNum++;
            // 写入.logstatus，更新行数
            return fs.writeFile(STATUS_FILE_PATH, `${lineNum} ${logsNum}`, {
                encoding: 'utf8',
                flag: 'w'
            });
        }).catch(e => {
            output(3, `Failed to write log: ${e}`, false);
        });
    }, rej => {
        output(3, rej, false);
    });
}
/**
 * 向控制台输出消息
 * @param {Number} level 消息等级
 * @param {String} msg 消息内容
 * @param {Boolean} writeInLog 是否写入日志（默认true）
 * @param {Number} time 日志时间戳（不指定则自动获取当前时间）
 * @note 1:普通提示 2:警告 3:错误
 */
function output(level, msg, writeInLog = true, time = 0) {
    switch (level) {
        case 1:
            console.log(chalk.green(msg));
            break;
        case 2:
            msg = '[WARNING] ' + msg;
            console.log(chalk.yellow(msg));
            break;
        case 3:
            msg = '[ERROR] ' + msg;
            console.log(chalk.red(msg));
            break;
    }
    if (writeInLog)
        writeLogs(msg, 0); // 写入日志
}

module.exports = output;