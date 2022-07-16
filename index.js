'use strict';
const httpServer = require('http');
const jsonReader = require('./basic/json-reader');
const outputer = require('./basic/output');

jsonReader('./configs/api_config').then(apiConfig => {
    console.log(apiConfig);
}, rejected => {
    outputer(3, 'api_config.json read failed!');
});

httpServer.createServer(function (req, res) {
    res.end('Hello World!');
}).listen(1234, () => {
    outputer(1, 'HTTP API Launched successfully.');
});
