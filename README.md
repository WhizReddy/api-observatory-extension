# api-observatory-extension

Monitor frontend API traffic and stream metadata to a backend observability platform.

## Features

- Monitor web requests across all websites
- Stream API metadata to backend platforms
- Easy-to-use popup interface

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this directory

## Development

This extension uses Manifest V3 and includes:
- Service worker for background processing
- Web request monitoring
- Storage for configuration

## Permissions

- `webRequest` & `webRequestBlocking`: Monitor network requests
- `storage`: Save configuration
- `activeTab`: Access current tab information
- `<all_urls>`: Monitor requests across all websites
