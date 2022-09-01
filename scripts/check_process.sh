#!/bin/bash
# 检查Java进程是否存在的脚本
# 如果脚本没有输出任何内容，则说明Java进程不存在

# 一旦进程结束，会创建这个文件
SIGNAL_FILE="$MC_DIR/serverProcess.lost"
if [ ! -e $SIGNAL_FILE ]; then
    echo "alive"
else
    # 记得接收到信号后删除这个文件
    rm -f $SIGNAL_FILE
fi