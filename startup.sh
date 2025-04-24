#!/bin/sh

# Print runtime environment for debugging
echo "Starting MinIO with the following environment:"
echo "PATH=$PATH"
echo "Current directory: $(pwd)"
echo "Files in /usr/bin: $(ls -la /usr/bin | grep minio)"

# Khởi động MinIO server
/usr/bin/minio server /mnt/data --console-address ":9001"