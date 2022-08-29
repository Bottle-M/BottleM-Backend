#!/bin/bash
# 抓取服务端

# 检查文件是否不存在的函数
function checkExist(){
    if [[ ! ( -e $1 ) ]]; then
        echo "Failed to get: $1"
        exit 1
    fi
}

# 先获得要下载的文件列表
./coscli cp cos://minecraft/server/filelist.txt $PACK_DIR/filelist.txt

# 保证下载成功再继续
checkExist $PACK_DIR/filelist.txt

index=0
packedFiles=()
# 逐行读取filelist.txt，抓取对应文件
while read filename;
do
    ./coscli cp "cos://minecraft/server/$filename" "$PACK_DIR/$filename" --thread-num 10
    # 保证下载成功再继续
    checkExist "$PACK_DIR/$filename"
    # 把压缩文件的绝对路径全记录在数组里
    packedFiles+=( "$PACK_DIR/$filename" )
    ((index++))
done < $PACK_DIR/filelist.txt

# 解压文件
# -I使用解压程序lz4，-C指定输出目录，短横线-代表cat的标准输出
cat ${packedFiles[@]} | tar -I lz4 -C $MC_DIR -xf -

if [[ $? -ne 0 ]]; then
    echo "Failed to unpack files"
    exit 1
fi

# 删除压缩包文件
rm -f ${packedFiles[@]}




