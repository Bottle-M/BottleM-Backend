#!/bin/bash

# 实例端下载URL
DOWNLOAD_URL='https://gitee.com/somebottle/BottleM-InsSide/releases/download/1.2.3/BottleM-InsSide_linux_x64'
# 实例端数据目录
DATA_DIR=/root/baseData
# 实例端可执行文件目录
INS_EXEC_DIR=/root/BottleM-InsSide
# 获得实例端可执行文件名
INS_EXEC_FILE=$(basename $DOWNLOAD_URL)

# 创建实例端可执行文件所在的目录
mkdir $INS_EXEC_DIR

# 进入实例端可执行文件所在的目录
cd $INS_EXEC_DIR

# 20条线程下载实例端可执行文件

axel -n 20 $DOWNLOAD_URL

if [[ $? -ne 0 ]]; then
    # 克隆代码失败
    echo "Failed to Download executable file"
    exit 1
fi

# 赋予可执行权限
chmod +x ./$INS_EXEC_FILE

# 执行daemon.sh
screen -L -dmS bottlem $DATA_DIR/daemon.sh $INS_EXEC_FILE