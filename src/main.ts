import { Websocket } from './websocket.js';

const WEBSOCKET_INFO_ADDRESS = process.env.WEBSOCKET_INFO_ADDRESS;
if (!WEBSOCKET_INFO_ADDRESS || !WEBSOCKET_INFO_ADDRESS.startsWith('https://')) {
  throw new Error(
    'WEBSOCKET_INFO_ADDRESS environment variable is not set or invalid'
  );
}

if (
  typeof process.env.COOKIE !== 'string' ||
  typeof process.env.TOKEN !== 'string'
) {
  throw new Error('COOKIE and TOKEN environment variables must be set');
}

console.log('MCServerManager');
console.debug(`Retrieving WebSocket info from ${WEBSOCKET_INFO_ADDRESS}.`);
const wsInfo = await fetch(WEBSOCKET_INFO_ADDRESS, {
  headers: {
    Dnt: '1',
    Pragma: 'no-cache',
    Priority: 'u=1, i',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
    Cookie: process.env.COOKIE,
    'X-Xsrf-Token': process.env.TOKEN,
  },
});

if (!wsInfo.ok) {
  console.error(
    `Failed to fetch WebSocket info: ${wsInfo.status} ${wsInfo.statusText}. Exiting.`
  );
  process.exit(1);
}

const data = (await wsInfo.json()).data;

if (!data.socket || !data.token) {
  console.error('WebSocket info is missing required fields. Exiting.');
  process.exit(1);
}

const socket = new Websocket();
socket.setToken(data.token).connect(data.socket);

socket.on('ws:open', () => {
  console.log('WebSocket connection established.');
});

socket.on('ws:close', () => {
  console.log('WebSocket connection closed.');
});

socket.on('ws:error', (error) => {
  console.error(`WebSocket error: ${error.message}`, error);
  process.exit(1);
});

socket.on('ws:reconnect', () => {
  console.log('Attempting to reconnect to WebSocket server...');
});

socket.on('auth success', () => {
  console.log('Authentication successful. Restarting server...');
  socket.send('set state', 'restart');
});

socket.on('token expiring', () => {
  console.warn('Token is expiring soon!');
});

socket.on('token expired', () => {
  console.error('Token has expired!');
});

socket.on('jwt error', (error) => {
  console.error('Failed to authenticate:', error);
  process.exit(1);
});

socket.on('status', (statusList) => {
  const status = statusList[0] || 'unknown';
  console.log('Server status:', status);

  if (status === 'starting') {
    console.log('Server is starting up successfully.');
    process.exit(0);
  }
});
