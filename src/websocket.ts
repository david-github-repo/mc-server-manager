// Based on iGamePanel / Pterodactyl

import { EventEmitter } from 'events';

export class Websocket extends EventEmitter {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #backoff = 5000;
  #ws: WebSocket | null = null;
  #url: string | null = null;
  #token = '';
  #manuallyClosed = false;

  connect(url: string): this {
    if (!url) {
      throw new Error('Websocket.connect called with empty URL');
    }

    this.#url = url;
    this.#manuallyClosed = false;
    this.#openConnection();

    return this;
  }

  #openConnection() {
    if (!this.#url) return;

    // Clear any leftover timer.
    this.#clearTimer();

    try {
      this.#ws = new WebSocket(this.#url, {
        // @ts-expect-error This works in Node.js, but TypeScript may not recognize it.
        headers: {
          Origin: process.env.ORIGIN_HEADER,
        },
      });

      // Fallback timer if connection does not open in time.
      this.#timer = setTimeout(() => {
        this.#incrementBackoff();
        this.#safeClose(4000, 'Connection timeout before open');
        this.#scheduleReconnect();
      }, this.#backoff);

      this.#ws.onopen = () => {
        this.#clearTimer();
        this.#backoff = 5000;
        this.emit('ws:open');
        this.authenticate();
      };

      this.#ws.onmessage = (e: MessageEvent) => {
        try {
          const data = typeof e.data === 'string' ? e.data : '';
          const { event, args } = JSON.parse(data);

          this.emit(event, args);
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      this.#ws.onerror = (err) => {
        this.emit('ws:error', err);
      };

      this.#ws.onclose = () => {
        this.#clearTimer();
        this.emit('ws:close');

        if (!this.#manuallyClosed) {
          this.#incrementBackoff();
          this.#scheduleReconnect();
        }
      };
    } catch (err) {
      this.emit('ws:error', err);
      this.#incrementBackoff();
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect() {
    if (!this.#url || this.#manuallyClosed) return;

    setTimeout(() => {
      if (this.#manuallyClosed) return;

      this.emit('ws:reconnect');
      this.#openConnection();
    }, this.#backoff);
  }

  #incrementBackoff() {
    this.#backoff =
      this.#backoff + 2500 >= 20000 ? 20000 : this.#backoff + 2500;
  }

  #safeClose(code?: number, reason?: string) {
    try {
      this.#ws && this.#ws.close(code, reason);
    } catch {
      /* ignore */
    } finally {
      this.#ws = null;
    }
  }

  #clearTimer() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  setToken(token: string, isUpdate = false): this {
    this.#token = token;

    if (isUpdate) {
      this.authenticate();
    }

    return this;
  }

  authenticate() {
    if (!this.#url || !this.#token) return;

    this.send('auth', this.#token);
  }

  close(code?: number, reason?: string) {
    this.#manuallyClosed = true;
    this.#url = null;
    this.#token = '';

    this.#clearTimer();
    this.#safeClose(code, reason);
  }

  open() {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) return;
    if (!this.#url) return;

    this.#manuallyClosed = false;
    this.#openConnection();
  }

  reconnect() {
    if (!this.#url) return;

    this.#manuallyClosed = false;

    this.emit('SOCKET_RECONNECT');
    this.#safeClose(4001, 'Manual reconnect');
    this.#openConnection();
  }

  send(event: string, payload?: string | string[]) {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return;

    const message = JSON.stringify({
      event,
      args: Array.isArray(payload) ? payload : [payload],
    });
    this.#ws.send(message);
  }
}
