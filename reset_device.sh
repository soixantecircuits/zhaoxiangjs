#!/bin/bash


if [ $# -ne 1 ];then
  echo "Usage: `basename $0` usb:busnum,devnum"
  exit 1
fi

str="$(echo $1 | tr ':' ' ' | tr ',' ' ')";
str=($str)
busnum=$(printf '%d' "${str[1]}");
devnum=$(printf '%d' "${str[2]}");

for X in /sys/bus/usb/devices/*; do 
    if [ $busnum == "$(cat "$X/busnum" 2>/dev/null)" -a $devnum == "$(cat "$X/devnum" 2>/dev/null)" ]
    then
        echo " Resetting device $X"
        devicepath=$X
    fi
done

sh -c "echo 0 > $devicepath/authorized"
sh -c "echo 1 > $devicepath/authorized"
