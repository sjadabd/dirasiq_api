const http = require('http');

// Use the IPv4 loopback explicitly. Node's DNS resolver on modern Alpine
// images prefers AAAA records, so `localhost` resolves to `::1` first — and
// if the Express server binds only to the IPv4 stack the probe fails inside
// the container even though `curl http://localhost:3000/health` from the
// host works. `127.0.0.1` skips name resolution entirely.
const options = {
  host: '127.0.0.1',
  port: process.env.PORT || 3000,
  path: '/health',
  timeout: 2000,
};

const request = http.request(options, res => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', err => {
  console.error('Health check failed:', err.message);
  process.exit(1);
});

request.on('timeout', () => {
  console.error('Health check timeout');
  request.destroy();
  process.exit(1);
});

request.end();
