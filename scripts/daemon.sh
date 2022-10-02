#!/bin/bash

# 本脚本不支持环境变量

# 本脚本在后台运行
# 启动实例端，如果意外退出则自动重启

# 判断有没有传入可执行文件名
if [ -z "$1" ]; then
    echo "No executable file name"
    exit 1
fi

INS_EXEC_FILE=$1

# 实例端数据目录
DATA_DIR=/root/baseData
# 实例端可执行文件目录
INS_EXEC_DIR=/root/BottleM-InsSide

while true;
do
    $INS_EXEC_DIR/$INS_EXEC_FILE --data $DATA_DIR
    echo 'Restarting instance side.'
    # 如果进程结束，等待3秒后重启
    sleep 3s
done