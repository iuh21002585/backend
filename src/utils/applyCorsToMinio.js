const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// Path to the CORS configuration file
const corsConfigPath = path.join(__dirname, '../../cors.json');

// Generate MinIO client command
function generateCorsCommand() {
  try {
    // Read CORS configuration from file to verify it exists and is valid
    const corsConfigBuffer = fs.readFileSync(corsConfigPath);
    JSON.parse(corsConfigBuffer); // Just to validate the JSON
    
    // Get bucket name and other MinIO details from environment variables
    const bucketName = process.env.MINIO_BUCKET_NAME || 'theses';
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    
    const protocol = useSSL ? 'https' : 'http';
    const serverUrl = `${protocol}://${endpoint}:${port}`;
    
    console.log('To configure CORS for your MinIO server, follow these steps:');
    console.log('\n1. Install MinIO Client (mc) if you don\'t have it already: https://min.io/docs/minio/linux/reference/minio-mc.html');
    console.log('\n2. Add your MinIO server to mc:');
    console.log(`   mc alias set myminio ${serverUrl} ${process.env.MINIO_ACCESS_KEY} ${process.env.MINIO_SECRET_KEY}`);
    console.log('\n3. Apply CORS configuration using the command:');
    console.log(`   mc admin bucket cors set myminio/${bucketName} ${corsConfigPath}`);
    
    console.log('\nAlternatively, you can configure CORS through the MinIO Console web interface.');
  } catch (error) {
    console.error('Error generating CORS command:', error);
  }
}

// Run the function
generateCorsCommand();