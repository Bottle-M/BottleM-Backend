#!/bin/bash
# 压缩打包Minecraft服务端的脚本

# 检查打包目录是否为空
if [[  -z "$(ls $PACK_DIR)"  ]]; then
    echo "Failed to get: $PACK_DIR"
    exit 1
fi

# 进入Minecraft服务端目录
cd $MC_DIR

# 使用lz4算法压缩后打包服务端
tar -I lz4 -cPf $PACK_DIR/serverAll.tar.lz4 *

# 切割服务端压缩包，2G一卷
cd $PACK_DIR
split -b 2048m -d serverAll.tar.lz4 -a 1 server_

# 删除临时服务端压缩包
rm -f serverAll.tar.lz4

# 扫描切割出来的文件，存入filelist.txt
for file in $(ls); do
    echo $file >> filelist.txt
done

