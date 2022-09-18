#!/bin/bash
# 本脚本在后台运行
# 启动实例端，如果意外退出则自动重启

# 实例端数据目录
DATA_DIR=/root/baseData
# 实例端可执行文件目录
INS_EXEC_DIR=/root/BottleM-InsSide

while true;
do
    $INS_EXEC_DIR/BottleM_InsSide_x64 --data $DATA_DIR
    echo 'Restarting instance side.'
    # 如果进程结束，等待3秒后重启
    sleep 3s
done