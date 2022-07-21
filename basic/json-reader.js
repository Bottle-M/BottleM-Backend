// 小型JSON文件读取模块
'use strict';
const { promises: fs, readFileSync } = require('fs'); // 载入基于Promise的文件系统模块
const path = require('path');

module.exports = {
    /**
    * 小文件JSON读取（异步）
    * @param {*} jPath 文件相对路径(以index.js所在目录为基准)
    * @returns Promise对象
    * @note 如果文件路径带.json后缀，路径写法和writeFile一致
    */
    asc: async function (jPath) {
        let fileTarget = jPath.includes('.json') ? jPath : (path.join(__dirname, '..', jPath) + '.json'); // 构建待读取文件路径
        return fs.readFile(fileTarget, {
            encoding: 'utf-8'
        }).then(data => {
            let parsedData = JSON.parse(data);
            return Promise.resolve(parsedData);
        }) // reject直接留给外面处理  
    },
    /**
     * 小文件JSON读取（同步）
     * @param {*} jPath 文件相对路径(以index.js所在目录为基准)
     * @returns 文件内容，如果失败了返回null
     * @note 如果文件路径带.json后缀，路径写法和writeFile一致
     */
    sc: function (jPath) {
        let fileTarget = jPath.includes('.json') ? jPath : (path.join(__dirname, '..', jPath) + '.json'); // 构建待读取文件路径
        try {
            return JSON.parse(readFileSync(fileTarget, {
                encoding: 'utf-8'
            }));
        } catch (e) {
            return null;
        }
    }
}