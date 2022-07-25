// 小型JSON文件读取模块
'use strict';
const { promises: fs, readFileSync } = require('fs'); // 载入基于Promise的文件系统模块
const path = require('path');

/**
* （异步）小文件JSON读取
* @param {String} jPath 文件相对路径(以index.js所在目录为基准)
* @returns Promise对象
* @note 如果文件路径带.json后缀，路径写法和writeFile一致
*/
function ascRead(jPath) {
    let fileTarget = jPath.includes('.json') ? jPath : (path.join(__dirname, '..', jPath) + '.json'); // 构建待读取文件路径
    return fs.readFile(fileTarget, {
        encoding: 'utf-8'
    }).then(data => {
        let parsedData = JSON.parse(data);
        return Promise.resolve(parsedData);
    }) // reject直接留给外面处理  
}

/**
 * （同步）小文件JSON读取
 * @param {String} jPath 文件相对路径(以index.js所在目录为基准)
 * @returns 文件内容，如果失败了返回null
 * @note 如果文件路径带.json后缀，路径写法和writeFile一致
 */
function scRead(jPath) {
    let fileTarget = jPath.includes('.json') ? jPath : (path.join(__dirname, '..', jPath) + '.json'); // 构建待读取文件路径
    try {
        return JSON.parse(readFileSync(fileTarget, {
            encoding: 'utf-8'
        }));
    } catch (e) {
        return null;
    }
}

/**
 * （异步）设置某个json文件的键值对
 * @param {String} jPath 文件相对路径(以index.js所在目录为基准)
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 * @returns {Promise}
 * @note 如果文件路径带.json后缀，路径写法和writeFile一致
 */
function ascSet(jPath, keys, values) {
    if (!(keys instanceof Array)) keys = [keys];
    if (!(values instanceof Array)) values = [values];
    return ascRead(jPath).then(parsed => {
        for (let i = 0, len = keys.length; i < len; i++) {
            if (keys[i] && values[i])
                parsed[keys[i]] = values[i];
        }
        return fs.writeFile(jPath, JSON.stringify(parsed));
    });
}

module.exports = {
    ascRead: ascRead,
    scRead: scRead,
    ascSet:ascSet
}