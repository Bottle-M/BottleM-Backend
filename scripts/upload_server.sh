#!/bin/bash
# 上传服务端压缩包

# 压缩包列表文件
FILE_LIST=$PACK_DIR/filelist.txt

# 上传到COS
./coscli cp $FILE_LIST cos://minecraft/server/filelist.txt，

# 逐行读取filelist.txt，上传对应文件
while read filename;
do
    ./coscli cp "$PACK_DIR/$filename" "cos://minecraft/server/$filename"  --thread-num 10
done < $FILE_LIST

