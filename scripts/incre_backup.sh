#!/bin/bash
# 打包并上传单次增量备份的部分
# 注：本脚本在每次实例端本地复制完毕文件后执行
# 在本脚本末尾你可以rm掉目录中的所有文件，不rm的话实例端也会自动清空
# 本脚本有独有环境变量：BACKUP_DEST_DIR(备份目标目录) RESTORE_DEST_DIR(恢复备份目标目录)，这个脚本只需把BACKUP_DEST_DIR中的文件打包上传即可

# 打包后的文件名(文件名.tar.lz4)
PACK_FILE_NAME="$BACKUP_NAME.tar.lz4"
# 进入要打包的目录
cd $BACKUP_DEST_DIR

# lz4压缩打包
tar -I lz4 -cPf $PACK_FILE_NAME *

# 打包后的文件路径
PACK_FILE_PATH="$BACKUP_DEST_DIR/$PACK_FILE_NAME"

cd /root

# 上传到COS
./coscli cp $PACK_FILE_PATH "cos://minecraft/incremental/$PACK_FILE_NAME"

# 移除本地的增量备份文件，这里不删除，实例端也会自动删除
if [ $BACKUP_DEST_DIR ]; then
    # 防止BACKUP_DEST_DIR为空，那样就出大事了
    rm -rf "$BACKUP_DEST_DIR/*"
fi