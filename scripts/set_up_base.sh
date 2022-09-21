#!/bin/bash
# 克隆实例端源码
# git clone https://ghproxy.com/https://github.com/SomeBottle/BottleM-InsSide

# 实例端数据目录
DATA_DIR=/root/baseData
# 实例端可执行文件目录
INS_EXEC_DIR=/root/BottleM-InsSide

# if [[ $? -ne 0 ]]; then
#     # 克隆代码失败
#     echo "Failed to Clone Code"
#     exit 1
# fi

mkdir $INS_EXEC_DIR

cd $INS_EXEC_DIR

# 20条线程下载实例端可执行文件

axel -n 20 https://gitee.com/somebottle/BottleM-InsSide/releases/download/1.1.0/BottleM-InsSide_linux_x64

if [[ $? -ne 0 ]]; then
    # 克隆代码失败
    echo "Failed to Download executable file"
    exit 1
fi

# npm install > /dev/null 2>&1

# 使用--data或-d选项指定数据目录，Backend会往这个目录中传输文件

# screen -L -dmS bottlem node index.js --data /root/baseData

chmod +x ./BottleM_InsSide_x64

# 执行daemon.sh
screen -L -dmS bottlem $DATA_DIR/daemon.sh

#forever start index.js --data /root/baseData 2>&1