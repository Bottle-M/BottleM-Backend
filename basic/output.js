// 控制台消息输出模块
'use strict';
const chalk = require('chalk');
/**
 * 向控制台输出消息
 * @param {*} level 消息等级
 * @param {*} msg 消息内容
 * @note 1:普通提示 2:警告 3:错误
 */
module.exports = function (level, msg) {
    switch (level) {
        case 1:
            console.log(chalk.green(msg));
            break;
        case 2:
            console.log(chalk.yellow(`[WARN] ${msg}`));
            break;
        case 3:
            console.log(chalk.red(`[ERROR] ${msg}`));
            break;
    }
}