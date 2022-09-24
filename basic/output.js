// 控制台消息输出模块（同时会记录日志）
'use strict';
const {
    promises: fs,
    statSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    renameSync,
} = require('fs');
const { MessageEvents } = require('./events');
const chalk = require('chalk');
const path = require('path');
// 载入配置
const API_CONFIGS = require('./config-box')['apiConfigs'];
// 从配置中获得日志绝对目录（默认为./api_logs）
const LOG_DIR = path.join(__dirname, '..', API_CONFIGS['logs_dir'] || './api_logs');
// .log_records日志记录文件
const RECORDS_FILE_PATH = path.join(LOG_DIR, '.log_records');
// 内存中的日志记录(内容同RECORDS_FILE_PATH)，减少I/O读写次数
// [目前latest.log的行数，旧日志(.old.log)数量]
var LOG_RECORDS = [0, 0];

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
    // 读取日志记录文件，缓存到内存中(存放日志数量和行数)
    // 顺带检查一下日志记录文件是否存在
    let record = readFileSync(RECORDS_FILE_PATH, {
        encoding: 'utf8',
    });
    LOG_RECORDS = record.split(' ');
} catch (e) {
    // 不存在该文件，写入初始数据0 0（目前的行数，日志数量）
    try {
        writeFileSync(RECORDS_FILE_PATH, LOG_RECORDS.join(' '), {
            encoding: 'utf8',
            flag: 'w'
        });
        console.log('.log_records created.');
    } catch (e) {
        // .log_records文件写入失败
        console.log(chalk.red(`[ERROR] Creating .log_records failed: ${e}`));
        process.exit(1);
    }
}

/**
 * （异步）写入日志
 * @param {String} logStr 待写入日志内容
 * @param {Number} time 日子时间戳（不指定则自动获取当前时间）
 * @returns {Promise<Boolean>} resolve一个布尔值代表是否成功 
 */
function writeLogs(logStr, time) {
    // 每个日志文件储存的最大行数
    const ROWS_PER_LOG = API_CONFIGS['rows_per_log'];
    // 储存日志文件数量的最大值
    const MAX_LOGS_RETAINED = API_CONFIGS['max_logs_retained'];
    // 当前日志文件路径
    let latestLogFilePath = path.join(LOG_DIR, 'latest.log'),
        currentDate = time ? new Date(time) : new Date();
    // 解析日志记录文件
    let [linesNum, oldLogsNum] = LOG_RECORDS,
        maxLogsNumExceeded = false; // 是否超出最大旧日志数量
    // latest日志行数超过配置的最多行数
    if (linesNum >= ROWS_PER_LOG) {
        // latest.log满了，需要新建旧日志文件
        try {
            // 旧日志数量+1
            oldLogsNum++;
            // 如果日志数量溢出，记录溢出的数量，以便后方删除早期的日志文件
            if (oldLogsNum - MAX_LOGS_RETAINED > 0) {
                maxLogsNumExceeded = true;
                oldLogsNum = MAX_LOGS_RETAINED;
            }
            // 将当前latest.log重命名为 时间戳.old.log
            // 值得注意的是这里必须同步，不然异步写入.log_records可能会互相影响
            renameSync(latestLogFilePath, path.join(LOG_DIR, `${currentDate.getTime()}.old.log`));
            // latest.log行数归零
            linesNum = 0;
        } catch (e) {
            output(3, `Failed to update .log_records: ${e}`, false);
            return Promise.resolve(false);
        }
    }
    // 对.log_records的修改必须同步，其余部分就交给异步处理了
    // 这一部分是针对.old.log文件的，而后面写入日志是针对latest.log的，而这互不干扰，所以可以直接创建两个异步操作
    // 检查是否已经储存了过多的旧日志文件
    if (maxLogsNumExceeded) {
        // 扫描当前的日志目录
        fs.readdir(LOG_DIR).then((fileList) => {
            // 按时间升序排序
            // 过滤日志格式
            let oldLogs = fileList.filter(item => item.includes('.old')),
                // 旧日志数量溢出了多少
                overflowedNum = oldLogs.length - MAX_LOGS_RETAINED;
            if (overflowedNum <= 0) {
                // 如果根本没溢出，就不用移除旧日志了
                // 顺带更新一下LOG_RECORDS中的logsNum记录，可能有记录错误
                LOG_RECORDS[1] = oldLogs.length;
                return;
            }
            // 按时间戳升序排序，把最早旧日志的排在前面
            oldLogs.sort((a, b) => {
                let formerStamp = Number(a.split('.old')[0]), // 前一个日志的时间戳
                    latterStamp = Number(b.split('.old')[0]); // 后一个日志的时间戳
                return formerStamp - latterStamp;
            });
            // 要删除的日志
            let forDeletion = oldLogs.slice(0, overflowedNum);
            forDeletion.forEach((file) => {
                // 删除日志
                fs.rm(path.join(LOG_DIR, file), {
                    force: true // 文件不存在也不会报错
                }).then(success => {
                    output(1, `Deleted log: ${file}`, false);
                });
            });
        }, rej => {
            output(3, `Fail to read old log files`, false);
        });
    }
    // 接下来将新的日志内容logStr写入日志latest.log
    // 获得日期字符串
    let dateStr = currentDate.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai'
    });
    // 行数增加
    linesNum++;
    // 更新内存中的LOG_RECORDS(一定要同步)
    LOG_RECORDS = [linesNum, oldLogsNum];
    return fs.appendFile(latestLogFilePath, `[${dateStr}]${logStr}\n`, {
        encoding: 'utf8',
        flag: 'a'
    }).then((res) => {
        // 日志写入成功，更新.log_records
        return fs.writeFile(RECORDS_FILE_PATH, LOG_RECORDS.join(' '), {
            encoding: 'utf8',
            flag: 'w'
        });
    }).catch((e) => {
        // 日志写入失败，日志行数-1
        LOG_RECORDS[0]--;
        output(3, `Failed to write log: ${e}`, false);
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
            // 激发消息事件
            MessageEvents.emit('normalmsg', msg, false);
            console.log(chalk.green(msg));
            break;
        case 2:
            MessageEvents.emit('warningmsg', msg, false);
            msg = '[WARNING] ' + msg;
            console.log(chalk.yellow(msg));
            break;
        case 3:
            MessageEvents.emit('errormsg', msg, true);
            msg = '[ERROR] ' + msg;
            console.log(chalk.red(msg));
            break;
    }
    if (writeInLog)
        writeLogs(msg, 0); // 写入日志
}

module.exports = output;