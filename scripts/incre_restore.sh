#!/bin/bash
# 下载并解包单次增量备份的部分
# 将压缩包解压到RESTORE_DEST_DIR(恢复备份目标目录)中，之后交给程序处理

# 检查文件是否不存在的函数
function checkExist(){
    if [[ ! ( -e $1 ) ]]; then
        echo "Failed to get: $1"
        exit 1
    fi
}

# 压缩包文件名
PACK_FILE_NAME="$BACKUP_NAME.tar.lz4"
# 压缩包文件路径
PACK_FILE_PATH="$RESTORE_DEST_DIR/$PACK_FILE_NAME"

# 下载压缩包
./coscli cp "cos://minecraft/incremental/$PACK_FILE_NAME" "$PACK_FILE_PATH"

checkExist $PACK_FILE_PATH

# 解压到RESTORE_DEST_DIR
tar -I lz4 -C "$RESTORE_DEST_DIR" -xf "$PACK_FILE_PATH"

if [[ $? -ne 0 ]]; then
    echo "Failed to unpack files"
    exit 1
fi

