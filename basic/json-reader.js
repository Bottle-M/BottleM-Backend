// 小型JSON文件读取模块
'use strict';
const { promises: fs, readFileSync } = require('fs'); // 载入基于Promise的文件系统模块
const path = require('path');
/**
* 小文件JSON读取
* @param {*} jPath 文件路径
* @returns Promise对象
*/
module.exports = {
    asc: async function (jPath) {
        let fileTarget = path.join(__dirname, '..', jPath) + '.json'; // 构建待读取文件路径
        return fs.readFile(fileTarget, {
            encoding: 'utf-8'
        }).then(data => {
            let parsedData = JSON.parse(data);
            return Promise.resolve(parsedData);
        }) // reject直接留给外面处理  
    },
    sc: function (jPath) {
        let fileTarget = path.join(__dirname, '..', jPath) + '.json'; // 构建待读取文件路径
        try {
            return JSON.parse(readFileSync(fileTarget, {
                encoding: 'utf-8'
            }));
        } catch (e) {
            return null;
        }
    }
}