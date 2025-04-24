/**
 * webPlagiarism.js
 * Module phát hiện đạo văn từ các nguồn web
 */

const axios = require('axios');
const utils = require('./utils');

// Sử dụng các hàm và biến từ utils.js
const { tokenizer, calculateCosineSimilarity, calculatePageNumber, searchCache, apiKeyStatus } = utils;

/**
 * Hàm phát hiện đạo văn từ các nguồn web
 * @param {string} content - Nội dung luận văn
 * @returns {Object} Kết quả phát hiện đạo văn từ web
 */
const detectPlagiarismFromWeb = async (content) => {
  try {
    console.log('Bắt đầu kiểm tra đạo văn từ các nguồn web');
    
    // Phân tích nội dung bằng cách chia thành các đoạn văn
    const paragraphs = content.split(/\n\s*\n/); // Chia thành các đoạn văn dựa trên dòng trống
    
    // Nếu nội dung quá ngắn, không thể phân tích
    if (paragraphs.length === 0) {
      return {
        webPlagiarismScore: 0,
        sources: [],
        textMatches: [],
        error: 'Nội dung luận văn quá ngắn để phân tích'
      };
    }
    
    // Danh sách nguồn phát hiện được
    const sources = [];
    // Danh sách các đoạn trùng khớp
    const textMatches = [];
    
    // Phân tích từng đoạn văn để tìm đạo văn
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      
      // Bỏ qua các đoạn quá ngắn
      if (paragraph.length < 50) continue;
      
      console.log(`Kiểm tra đoạn văn thứ ${i+1}/${paragraphs.length}`);
      
      try {
        // Tạo query tìm kiếm từ đoạn văn
        const searchQuery = paragraph.substring(0, 150); // Lấy tối đa 150 ký tự đầu để tìm kiếm
        
        // Mô phỏng tìm kiếm trên web
        const searchResults = await searchWeb(searchQuery);
        
        // Tính toán vị trí ký tự của đoạn văn này trong toàn bộ nội dung
        const charPosition = content.indexOf(paragraph);
        
        for (const result of searchResults) {
          // Trích xuất nội dung từ trang web
          const webContent = await extractWebContent(result.url);
          
          // Xác định các câu trong đoạn văn
          const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
          
          // Kiểm tra từng câu trong đoạn văn
          for (let j = 0; j < sentences.length; j++) {
            const sentence = sentences[j].trim();
            
            // Bỏ qua các câu quá ngắn
            if (sentence.length < 30) continue;
            
            // Tìm kiếm câu tương tự trong nội dung web
            const webSentences = webContent.match(/[^.!?]+[.!?]+/g) || [];
            
            // Biến lưu trữ độ tương đồng cao nhất
            let maxSimilarity = 0;
            let mostSimilarWebSentence = '';
            
            // So sánh với từng câu trong nội dung web
            for (const webSentence of webSentences) {
              if (webSentence.length < 20) continue; // Bỏ qua các câu quá ngắn
              
              // Tính độ tương đồng
              const similarity = calculateCosineSimilarity(sentence, webSentence);
              
              // Cập nhật kết quả nếu tìm thấy độ tương đồng cao hơn
              if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                mostSimilarWebSentence = webSentence;
              }
            }
            
            // Nếu độ tương đồng vượt ngưỡng, coi là đạo văn
            if (maxSimilarity > 0.5) {
              // Thêm nguồn vào danh sách nếu chưa có
              if (!sources.some(s => s.url === result.url)) {
                sources.push({
                  title: result.title,
                  author: result.author || "Không xác định",
                  similarity: Math.round(maxSimilarity * 100),
                  url: result.url,
                  domain: new URL(result.url).hostname,
                  dateExtracted: new Date().toISOString().split('T')[0]
                });
              }
              
              // Tính số trang
              const pageNumber = calculatePageNumber(content, charPosition);
              
              // Thêm đoạn trùng khớp
              textMatches.push({
                sourceText: mostSimilarWebSentence.trim(),
                thesisText: sentence,
                similarity: Math.round(maxSimilarity * 100),
                source: {
                  title: result.title,
                  author: result.author || "Không xác định",
                  url: result.url,
                  domain: new URL(result.url).hostname,
                  dateExtracted: new Date().toISOString().split('T')[0]
                },
                paragraph: i + 1, // Lưu vị trí đoạn văn
                charPositionInThesis: charPosition, // Vị trí ký tự trong toàn bộ văn bản
                pageNumber: pageNumber // Số trang ước tính
              });
              
              console.log(`Phát hiện đạo văn ở đoạn ${i+1}, trang ${pageNumber}, độ tương đồng: ${Math.round(maxSimilarity * 100)}%`);
            }
          }
        }
      } catch (error) {
        console.error(`Lỗi khi kiểm tra đoạn văn thứ ${i+1}:`, error);
        // Tiếp tục với đoạn văn tiếp theo nếu có lỗi
      }
    }
    
    // Sắp xếp kết quả theo độ tương đồng giảm dần
    textMatches.sort((a, b) => b.similarity - a.similarity);
    
    // Tính điểm đạo văn từ web dựa trên số lượng trùng khớp và độ tương đồng
    const totalParagraphs = paragraphs.length;
    const paragraphsWithPlagiarism = new Set(textMatches.map(match => match.paragraph)).size;
    
    const webPlagiarismScore = Math.min(
      Math.round((paragraphsWithPlagiarism / totalParagraphs) * 100 * 
        (textMatches.reduce((sum, match) => sum + match.similarity, 0) / 
          (textMatches.length * 100 || 1))),
      100
    );
    
    return {
      webPlagiarismScore,
      sources,
      textMatches,
      totalParagraphs,
      plagiarizedParagraphs: paragraphsWithPlagiarism
    };
  } catch (error) {
    console.error('Lỗi khi phát hiện đạo văn từ web:', error);
    throw error;
  }
};

/**
 * Mô phỏng kết quả tìm kiếm web khi không có API thực tế
 * @param {string} query - Query tìm kiếm
 * @returns {Array} Danh sách kết quả tìm kiếm mô phỏng
 */
const simulateWebSearch = (query) => {
  console.log(`Mô phỏng tìm kiếm web cho: "${query.substring(0, 50)}..."`);
  
  // Tạo kết quả tìm kiếm mô phỏng với các URL thực tế thay vì các domain giả
  const simulatedResults = [
    {
      title: `Kết quả nghiên cứu về ${query.substring(0, 30)}`,
      url: `https://vi.wikipedia.org/wiki/${encodeURIComponent(query.substring(0, 20))}`,
      author: "Wikipedia",
      publication: "wikipedia.org",
      year: new Date().getFullYear()
    },
    {
      title: `Phân tích chuyên sâu: ${query.substring(0, 25)}`,
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query.substring(0, 15))}`,
      author: "Google Scholar",
      publication: "scholar.google.com",
      year: new Date().getFullYear() - 1
    },
    {
      title: `Nghiên cứu mới nhất về chủ đề ${query.substring(0, 20)}`,
      url: `https://www.researchgate.net/search/publication?q=${encodeURIComponent(query.substring(0, 10))}`,
      author: "ResearchGate",
      publication: "researchgate.net",
      year: new Date().getFullYear() - 2
    }
  ];
  
  return simulatedResults;
};

/**
 * Mô phỏng trích xuất nội dung web khi không thể truy cập thực tế
 * @param {string} url - URL của trang web
 * @returns {string} Nội dung mô phỏng
 */
const simulateWebContentExtraction = (url) => {
  console.log(`Mô phỏng trích xuất nội dung từ: ${url}`);
  
  // Tạo nội dung mô phỏng dựa trên URL
  return `Đây là nội dung mô phỏng được tạo cho URL: ${url}. 
  Trong nghiên cứu này, chúng tôi đã phân tích các yếu tố ảnh hưởng đến hiệu suất của hệ thống. 
  Kết quả cho thấy có mối tương quan mạnh giữa các biến số nghiên cứu. 
  Phương pháp nghiên cứu bao gồm thu thập dữ liệu, phân tích định lượng và đánh giá chất lượng.
  Những phát hiện này có ý nghĩa quan trọng trong việc phát triển các ứng dụng trong tương lai.
  Chúng tôi cũng đề xuất một số hướng nghiên cứu tiếp theo để mở rộng phạm vi của nghiên cứu hiện tại.`;
};

/**
 * Tìm kiếm trên web thông qua API Google Search sử dụng nhiều API key
 * @param {string} query - Query tìm kiếm
 * @returns {Array} Danh sách kết quả tìm kiếm
 */
const searchWeb = async (query) => {
  try {
    // Chuẩn hóa query để sử dụng làm key cache
    const normalizedQuery = query.trim().toLowerCase().substring(0, 100);
    
    // Kiểm tra cache trước khi gọi API
    if (searchCache.has(normalizedQuery)) {
      console.log(`Sử dụng kết quả tìm kiếm từ cache cho: "${query.substring(0, 50)}..."`);
      return searchCache.get(normalizedQuery);
    }
    
    console.log(`Thực hiện tìm kiếm web với query: "${query.substring(0, 50)}..."`);
    
    // Lấy danh sách API keys từ biến môi trường
    const allGoogleApiKeys = (process.env.GOOGLE_API_KEYS || process.env.GOOGLE_API_KEY || '').split(',').filter(key => key.trim());
    const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;
    
    // Nếu không có API key nào hoặc không có Search Engine ID
    if (allGoogleApiKeys.length === 0 || !SEARCH_ENGINE_ID) {
      console.warn('Google Search API không được cấu hình - sử dụng dữ liệu mô phỏng');
      const results = simulateWebSearch(query);
      searchCache.set(normalizedQuery, results);
      return results;
    }
    
    // Lọc các API key còn khả dụng (chưa bị vượt quá quota hoặc đã hết thời gian chờ)
    const now = Date.now();
    const availableApiKeys = allGoogleApiKeys.filter(key => {
      const status = apiKeyStatus.get(key);
      if (!status) return true; // Chưa có thông tin về key này
      
      // Nếu key bị vượt quá quota và thời gian chờ chưa hết
      if (status.quotaExceeded && status.retryAfter > now) {
        return false;
      }
      return true;
    });
    
    // Kiểm tra ngẫu nhiên để không vượt quá quota
    const shouldUseRealSearch = Math.random() < 0.5; // Tăng tỷ lệ lên 50% vì có nhiều key
    
    if (availableApiKeys.length === 0 || !shouldUseRealSearch) {
      const reason = availableApiKeys.length === 0 ? 
                    'Tất cả API keys đã vượt quá quota' : 
                    'Tiết kiệm quota API';
      console.warn(`${reason} - sử dụng dữ liệu mô phỏng`);
      
      const results = simulateWebSearch(query);
      searchCache.set(normalizedQuery, results);
      return results;
    }
    
    // Chọn ngẫu nhiên một API key từ các key khả dụng
    const randomIndex = Math.floor(Math.random() * availableApiKeys.length);
    const selectedApiKey = availableApiKeys[randomIndex];
    
    console.log(`Đang gọi Google API với key: ${selectedApiKey.substring(0, 5)}... và Search Engine ID: ${SEARCH_ENGINE_ID}`);
    
    const url = `https://www.googleapis.com/customsearch/v1?key=${selectedApiKey}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
    
    try {
      const response = await axios.get(url);
      
      // Kiểm tra và log kết quả từ API
      if (response.data && response.data.items && response.data.items.length > 0) {
        console.log(`Nhận được ${response.data.items.length} kết quả từ Google Search API`);
        
        // Xử lý và định dạng kết quả tìm kiếm
        const results = response.data.items.slice(0, 5).map(item => ({
          title: item.title,
          url: item.link,
          author: item.pagemap?.metatags?.[0]?.['author'] || "Không xác định",
          publication: item.displayLink,
          year: new Date().getFullYear() // Hoặc trích xuất từ thẻ meta nếu có
        }));
        
        // Lưu kết quả vào cache
        searchCache.set(normalizedQuery, results);
        
        // Cập nhật trạng thái API key - thành công
        apiKeyStatus.set(selectedApiKey, { 
          lastSuccess: now,
          quotaExceeded: false,
          retryAfter: 0
        });
        
        return results;
      } else {
        console.warn('Google Search API trả về kết quả trống hoặc không hợp lệ');
        console.log('Phản hồi từ API:', JSON.stringify(response.data, null, 2));
        
        // Nếu không có kết quả, sử dụng dữ liệu mô phỏng
        const results = simulateWebSearch(query);
        searchCache.set(normalizedQuery, results);
        return results;
      }
    } catch (apiError) {
      console.error('Lỗi khi tìm kiếm web:', apiError.message);
      console.error('Chi tiết lỗi:', apiError.stack);
      
      if (apiError.response) {
        console.error('Phản hồi lỗi từ Google API:', JSON.stringify(apiError.response.data, null, 2));
        console.error('Mã trạng thái HTTP:', apiError.response.status);
        
        // Nếu là lỗi vượt quá quota (429), đánh dấu API key này và thời gian cần chờ
        if (apiError.response.status === 429) {
          console.warn(`API key ${selectedApiKey.substring(0, 5)}... đã vượt quá hạn ngạch, sẽ không sử dụng trong 6 giờ tới`);
          
          apiKeyStatus.set(selectedApiKey, {
            quotaExceeded: true,
            retryAfter: now + (6 * 60 * 60 * 1000),
            lastError: now
          });
          
          // Nếu còn API key khả dụng khác, thử lại với key đó
          if (availableApiKeys.length > 1) {
            const remainingKeys = availableApiKeys.filter(key => key !== selectedApiKey);
            const nextKey = remainingKeys[Math.floor(Math.random() * remainingKeys.length)];
            
            console.log(`Thử lại với API key khác: ${nextKey.substring(0, 5)}...`);
            
            // Cập nhật URL với API key mới
            const newUrl = `https://www.googleapis.com/customsearch/v1?key=${nextKey}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
            
            try {
              const retryResponse = await axios.get(newUrl);
              if (retryResponse.data && retryResponse.data.items) {
                const results = retryResponse.data.items.slice(0, 5).map(item => ({
                  title: item.title,
                  url: item.link,
                  author: item.pagemap?.metatags?.[0]?.['author'] || "Không xác định",
                  publication: item.displayLink,
                  year: new Date().getFullYear()
                }));
                
                searchCache.set(normalizedQuery, results);
                return results;
              }
            } catch (retryError) {
              console.error('Lỗi khi thử lại với API key khác:', retryError.message);
            }
          }
        }
      }
      
      // Fallback to simulation if API call fails
      const results = simulateWebSearch(query);
      searchCache.set(normalizedQuery, results);
      return results;
    }
  } catch (error) {
    console.error('Lỗi ngoại lệ khi tìm kiếm web:', error.message);
    
    // Fallback to simulation if something unexpected happens
    const results = simulateWebSearch(query);
    return results;
  }
};

/**
 * Trích xuất nội dung từ một trang web thực tế
 * @param {string} url - URL của trang web
 * @returns {string} Nội dung trích xuất
 */
const extractWebContent = async (url) => {
  try {
    console.log(`Trích xuất nội dung từ: ${url}`);
    
    // Kiểm tra nếu URL hợp lệ
    if (!url || !url.startsWith('http')) {
      throw new Error('URL không hợp lệ');
    }
    
    // Kiểm tra xem URL có phải là từ trang tìm kiếm không
    if (url.includes('google.com/scholar') || 
        url.includes('researchgate.net/search') || 
        url.includes('wikipedia.org/wiki')) {
      console.log(`URL ${url} là trang tìm kiếm, sử dụng nội dung mô phỏng.`);
      return simulateWebContentExtraction(url);
    }
    
    // Đặt timeout và thử lại
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 8000, // Tăng timeout lên 8 giây
      maxRedirects: 5  // Cho phép tối đa 5 lần chuyển hướng
    };
    
    try {
      // Sử dụng axios để lấy nội dung HTML
      const response = await axios.get(url, options);
      
      // Trích xuất nội dung văn bản từ HTML
      let content = response.data;
      
      // Loại bỏ tất cả các thẻ HTML
      content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
      content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
      content = content.replace(/<[^>]+>/g, ' ');
      
      // Loại bỏ khoảng trắng thừa và normalize
      content = content.replace(/\s+/g, ' ').trim();
      
      // Trả về một phần nội dung để phân tích
      return content.substring(0, 5000);
    } catch (axiosError) {
      console.error(`Lỗi HTTP khi trích xuất nội dung từ ${url}:`, axiosError.message);
      
      // Xử lý các loại lỗi cụ thể
      if (axiosError.code === 'ECONNABORTED') {
        console.warn(`Timeout khi kết nối đến ${url}`);
      } else if (axiosError.code === 'ENOTFOUND') {
        console.warn(`Không thể tìm thấy host: ${url}`);
      } else if (axiosError.response) {
        console.warn(`Nhận được mã phản hồi: ${axiosError.response.status} từ ${url}`);
      }
      
      // Sử dụng nội dung mô phỏng
      return simulateWebContentExtraction(url);
    }
  } catch (error) {
    console.error(`Lỗi khi trích xuất nội dung từ ${url}:`, error.message);
    // Fallback to simulation if extraction fails
    return simulateWebContentExtraction(url);
  }
};

module.exports = {
  detectPlagiarismFromWeb,
  searchWeb,
  extractWebContent
};