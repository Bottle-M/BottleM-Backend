// 通用小工具函数
'use strict';
const chalk = require('chalk');
const {
    statSync,
    mkdirSync,
    writeFileSync
} = require('fs');
const path = require('path');
/**
 * （同步）写入文件（自动创建目录）
 * @param {String} filePath 文件路径
 * @param {String} data 写入的数据
 * @returns {Boolean} 布尔值，代表是否成功
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
 * 生成一定长度的随机字符串
 * @param {Number} len 
 * @returns {String} 随机字符串
 */
function randStr(len) {
    let charList = 'ABCDEYZ$abcdefFGH#STUVWXghijk_lmnIJKLMNOPQR*opqr$stuvw_xy#z0123456*789',
        charNum = charList.length,
        finalStr = ''; // 结果字符串
    for (let i = 0; i < len; i++) {
        // 因为JavaScript随机数是伪随机，这里尽量使其更难以摸透
        let randTimes = Math.floor(Math.random() * 6) + 1,
            result = 0;
        for (let j = 0; j < randTimes; j++) {
            result = Math.floor(Math.random() * charNum);
        }
        finalStr += charList[result];
    }
    return finalStr;
}

module.exports = {
    elasticWrite,
    randStr
}