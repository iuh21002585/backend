const { s3Client, DEFAULT_BUCKET_NAME, initializeBucket, b2Config } = require('./config/b2');
const dotenv = require('dotenv');

dotenv.config();

async function testB2Connection() {
  try {
    console.log('Cấu hình Backblaze B2 Client:', {
      endpoint: b2Config.endpoint,
      accessKeyId: b2Config.accessKeyId ? '******' : 'not set',
      secretAccessKey: b2Config.secretAccessKey ? '******' : 'not set',
      bucketName: DEFAULT_BUCKET_NAME,
      region: b2Config.region
    });

    // Khởi tạo kết nối và bucket
    await initializeBucket();
    console.log('✓ Kết nối Backblaze B2 thành công');

    // Liệt kê các bucket
    console.log('\nĐang liệt kê các bucket...');
    const { Buckets } = await s3Client.listBuckets().promise();
    console.log('Các bucket có sẵn:', Buckets.map(b => b.Name));
    
    // Tạo một object thử nghiệm
    const testObjectName = `test-${Date.now()}.txt`;
    console.log(`\nĐang tạo object thử nghiệm: ${testObjectName}...`);
    
    const testContent = Buffer.from('Đây là file kiểm tra Backblaze B2 connection', 'utf8');
    
    await s3Client.putObject({
      Bucket: DEFAULT_BUCKET_NAME,
      Key: testObjectName,
      Body: testContent
    }).promise();
    console.log('✓ Tạo object thành công');
    
    // Tạo presigned URL để truy cập file
    console.log('\nĐang tạo URL tạm thời để truy cập file...');
    const url = await s3Client.getSignedUrlPromise('getObject', {
      Bucket: DEFAULT_BUCKET_NAME,
      Key: testObjectName,
      Expires: 60*60 // 1 giờ
    });
    
    console.log('URL tạm thời:', url);
    console.log('✓ Tạo URL thành công');
    
    // Xóa object thử nghiệm
    console.log('\nĐang xóa object thử nghiệm...');
    await s3Client.deleteObject({
      Bucket: DEFAULT_BUCKET_NAME,
      Key: testObjectName
    }).promise();
    
    console.log('✓ Đã xóa object thử nghiệm');
    
    return true;
  } catch (error) {
    console.error('Lỗi khi kiểm tra Backblaze B2:', error);
    return false;
  }
}

async function main() {
  try {
    const result = await testB2Connection();
    
    if (result) {
      console.log('\nKiểm tra kết nối Backblaze B2 thành công!');
    } else {
      console.error('Kiểm tra kết nối Backblaze B2 thất bại!');
      process.exit(1);
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra Backblaze B2:', error);
    process.exit(1);
  }
}

main();