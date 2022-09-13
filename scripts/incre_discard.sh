#!/bin/bash
# 抛弃现存所有增量备份文件的脚本
# 实例端会删除实例端本地和主控端的记录文件，这个脚本的主要功能是删除COS上的增量备份文件
# 本脚本独有环境变量：BACKUP_NAME_LIST，包含所有备份文件名的列表，不包括扩展名

# 你当然可以这样写：
# for i in $BACKUP_NAME_LIST; do
#     FILE_NAME="$i.tar.lz4"
#     ./coscli rm "cos://minecraft/incremental/$FILE_NAME" -f
# done


# 不过coscli在上传文件时能自动创建目录，所以我们可以简单粗暴一点：
# 如果incremental目录不存在，可能会报错，不过实例端在没有增量备份的情况下不会discardBackup
./coscli rm "cos://minecraft/incremental" -r -f
