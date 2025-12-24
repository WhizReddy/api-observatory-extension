// Create a simple local server test
const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// Serve the test page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-page.html'));
});

// Quiet favicon errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// API endpoints for testing
app.get('/api/users', (req, res) => {
  setTimeout(() => {
    res.json({ users: ['Alice', 'Bob', 'Charlie'], timestamp: Date.now() });
  }, Math.random() * 500 + 100); // Random delay 100-600ms
});

app.get('/api/posts', (req, res) => {
  setTimeout(() => {
    res.json({ posts: ['Post 1', 'Post 2', 'Post 3'], count: 3 });
  }, Math.random() * 300 + 50);
});

app.post('/api/comments', (req, res) => {
  setTimeout(() => {
    res.json({ id: Math.floor(Math.random() * 1000), created: true, received: req.body || null });
  }, Math.random() * 400 + 200);
});

app.get('/v1/data', (req, res) => {
  res.json({ data: 'sample data', version: 'v1' });
});

app.get('/api/settings', (req, res) => {
  setTimeout(() => {
    res.json({ theme: 'dark', flags: { demo: true }, timestamp: Date.now() });
  }, Math.random() * 250 + 50);
});

app.get('/api/nonexistent', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
  console.log('Open this URL in your browser to test the API Observatory extension');
});