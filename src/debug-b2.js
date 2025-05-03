const { b2Client } = require('./config/b2');
const { DEFAULT_BUCKET_NAME } = require('./utils/b2Uploader');

// Debug B2 configuration and bucket
const checkB2 = async () => {
  try {
    console.log('Cấu hình B2 Client:', {
      applicationKeyId: process.env.B2_APPLICATION_KEY_ID ? '***' : 'Missing',
      applicationKey: '***', // Ẩn mật khẩu
      bucketId: process.env.B2_BUCKET_ID || 'Missing',
      bucketName: DEFAULT_BUCKET_NAME
    });

    // List all buckets
    console.log('\nDanh sách tất cả bucket:');
    const response = await b2Client.listBuckets();
    console.log(response.data);

    // Try creating a small test file
    const testObjectName = `test-${Date.now()}.txt`;
    const testContent = Buffer.from('Đây là file kiểm tra B2 connection', 'utf8');

    console.log(`\nĐang tải lên file kiểm tra: ${testObjectName}`);
    
    // Get upload URL and authorization token
    const getUploadUrlResponse = await b2Client.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID
    });
    
    const uploadUrl = getUploadUrlResponse.data.uploadUrl;
    const authToken = getUploadUrlResponse.data.authorizationToken;
    
    // Upload file
    await b2Client.uploadFile({
      uploadUrl: uploadUrl,
      uploadAuthToken: authToken,
      fileName: testObjectName,
      data: testContent,
      contentLength: testContent.length
    });
    
    console.log('Tải lên file kiểm tra thành công!');
    
    // List files in bucket to confirm
    const listFilesResponse = await b2Client.listFileNames({
      bucketId: process.env.B2_BUCKET_ID,
      maxFileCount: 10
    });
    
    console.log('\nDanh sách các file trong bucket:');
    console.log(listFilesResponse.data.files);
    
  } catch (error) {
    console.error('Lỗi khi kiểm tra B2:', error);
  }
};

// Run the check function
checkB2()
  .then(() => console.log('Kiểm tra B2 hoàn tất!'))
  .catch(err => console.error('Lỗi trong qúa trình kiểm tra B2:', err));