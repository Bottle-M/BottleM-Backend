// 小型JSON文件读取模块
'use strict';
const { promises: fs, readFileSync, writeFileSync } = require('fs'); // 载入基于Promise的文件系统模块
const path = require('path');

/**
* （异步）小文件JSON读取
* @param {String} jPath json文件绝对路径
* @returns Promise对象
*/
function ascRead(jPath) {
    return fs.readFile(jPath, {
        encoding: 'utf-8'
    }).then(data => {
        let parsedData = JSON.parse(data);
        return Promise.resolve(parsedData);
    }) // reject直接留给外面处理  
}

/**
 * （同步）小文件JSON读取
 * @param {String} jPath json文件绝对路径
 * @returns 文件内容，如果失败了返回null
 */
function scRead(jPath) {
    try {
        return JSON.parse(readFileSync(jPath, {
            encoding: 'utf-8'
        }));
    } catch (e) {
        return null;
    }
}

/**
 * （异步）设置某个json文件的键值对
 * @param {String} jPath json文件绝对路径
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 * @returns {Promise}
 */
function ascSet(jPath, keys, values) {
    if (!(keys instanceof Array)) keys = [keys];
    if (!(values instanceof Array)) values = [values];
    return ascRead(jPath).then(parsed => {
        for (let i = 0, len = keys.length; i < len; i++) {
            if (keys[i] !== undefined && values[i] !== undefined)
                parsed[keys[i]] = values[i];
        }
        return fs.writeFile(jPath, JSON.stringify(parsed), {
            encoding: 'utf-8'
        });
    });
}

/**
 * （同步）设置某个json文件的键值对
 * @param {String} jPath json文件绝对路径
 * @param {String|Array} keys 设置的键（可以是键组成的数组）
 * @param {String|Array} values 设置的内容（可以是内容组成的数组）
 * @returns {Boolean} 是否成功
 */
function scSet(jPath, keys, values) {
    if (!(keys instanceof Array)) keys = [keys];
    if (!(values instanceof Array)) values = [values];
    try {
        let parsed = scRead(jPath);
        if (parsed) {
            for (let i = 0, len = keys.length; i < len; i++) {
                if (keys[i] !== undefined && values[i] !== undefined)
                    parsed[keys[i]] = values[i];
            }
            writeFileSync(jPath, JSON.stringify(parsed), {
                encoding: 'utf-8'
            });
            return true;
        } else {
            return false;
        }
    } catch (e) {
        console.log(`Failed to set JSON file: ${jPath}, error: ${e}`);
        return false;
    }
}


module.exports = {
    ascRead,
    scRead,
    ascSet,
    scSet
}