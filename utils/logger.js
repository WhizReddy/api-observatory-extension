// utils/logger.js

/**
 * Sends a log to the backend observability platform.
 * @param {Object} logData - The log data to send.
 */
export async function sendLog(logData) {
  try {
    const response = await fetch('https://your-backend-url.com/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY' // Replace with actual API key
      },
      body: JSON.stringify(logData)
    });

    if (!response.ok) {
      console.error('Failed to send log:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending log:', error);
  }
}