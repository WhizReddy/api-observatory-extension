// config.js - Configuration file for API Observatory Extension

export const CONFIG = {
  // Backend API configuration
  BACKEND_URL: 'https://api.observatory-backend.com/logs',
  API_KEY_STORAGE_KEY: 'api_observatory_api_key',
  
  // Request filtering settings
  API_PATH_PATTERNS: ['/api', '/v1/', '/v2/', '/graphql'],
  
  // Performance settings
  MAX_PENDING_REQUESTS: 1000,
  CLEANUP_INTERVAL_MS: 30000,
  REQUEST_TIMEOUT_MS: 60000,
  
  // Batch settings (for future optimization)
  BATCH_SIZE: 10,
  BATCH_TIMEOUT_MS: 5000,
  
  // Extension metadata
  VERSION: '1.0.0',
  NAME: 'API Observatory'
};