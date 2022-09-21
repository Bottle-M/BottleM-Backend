// 载入扩展的模块
'use strict';
const { readdirSync } = require('fs');
const { join } = require('path');
const outputer = require('./output');

/**
 * 初始化扩展(extensions目录下的所有文件)
 */
module.exports = function () {
    const EXTENSION_DIR = join(__dirname, '../extensions');
    let extensions;
    try {
        // 读取扩展目录
        extensions = readdirSync(EXTENSION_DIR);
    } catch (e) {
        outputer(2, `[Extensions]Failed to read extensions directory:${e}`);
    }
    // 遍历扩展目录
    extensions.forEach((extension) => {
        // 载入扩展
        try {
            if (require(join(EXTENSION_DIR, extension))()) {
                outputer(1, `[Extensions]${extension} loaded.`);
            } else {
                outputer(2, `[Extensions]${extension}  loaded with some problems.`);
            }
        } catch (e) {
            outputer(2, `[Extensions]Failed to load ${extension}:${e}`);
        }
    });
}