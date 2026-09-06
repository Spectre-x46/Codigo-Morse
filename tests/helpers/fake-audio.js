/**
 * AudioContext falso, suficiente para `core/audio.js`.
 *
 * No simula sonido: simula el RELOJ y el registro de automatizaciones, que es
 * lo único de lo que depende el timing Morse. Con esto el motor de audio y la
 * llave se pueden probar con `node --test`, sin navegador y sin instalar nada.
 *
 * El reloj no avanza solo: lo mueve el test con `ctx.advance(seconds)`. Así las
 * pruebas de umbral punto/raya son deterministas en vez de depender de esperas.
 */

class FakeParam {
  constructor() { this.value = 0; this.events = []; }
  cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
  setValueAtTime(v, t) { this.events.push(['set', t, v]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['ramp', t, v]); this.value = v; return this; }
}

class FakeNode {
  constructor(ctx) { this.ctx = ctx; this.connections = []; this.disconnected = false; }
  connect(dest) { this.connections.push(dest); return dest; }
  disconnect() { this.disconnected = true; }
}

class FakeGain extends FakeNode {
  constructor(ctx) { super(ctx); this.gain = new FakeParam(); }
}

class FakeOscillator extends FakeNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'sine';
    this.frequency = new FakeParam();
    this.started = null;
    this.stopAt = Infinity;
    this.onended = null;
    this.ended = false;
  }
  start(t = this.ctx.currentTime) { this.started = t; this.ctx.oscillators.push(this); }
  stop(t = this.ctx.currentTime) {
    // Igual que el nodo real: una segunda llamada adelanta la parada.
    this.stopAt = Math.min(this.stopAt, t);
    this.ctx._maybeEnd(this);
  }
}

export class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.outputLatency = 0;
    this.destination = new FakeNode(this);
    this.oscillators = [];
  }
  createGain() { return new FakeGain(this); }
  createOscillator() { return new FakeOscillator(this); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }

  /** Avanza el reloj y dispara los `onended` que correspondan. */
  advance(seconds) {
    this.currentTime += seconds;
    for (const osc of [...this.oscillators]) this._maybeEnd(osc);
  }

  _maybeEnd(osc) {
    if (osc.ended || osc.stopAt > this.currentTime) return;
    osc.ended = true;
    osc.onended?.();
  }
}

/**
 * Instala el contexto falso en `globalThis` y devuelve la instancia que
 * `audio.js` acabará creando. Debe llamarse ANTES de importar `core/audio.js`.
 */
export function installFakeAudio() {
  let instance = null;
  globalThis.AudioContext = function AudioContextStub() {
    instance = new FakeAudioContext();
    return instance;
  };
  return () => instance;
}
