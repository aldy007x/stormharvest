// STORMHARVEST — audio.js
// All sound is synthesised with WebAudio: no audio files, no network.
//  - Ambient loop: filtered noise (wind + rain) under a slow-breathing low
//    drone, gain shaped by how violent the current storm is.
//  - SFX: each effect is a tiny recipe of oscillators / noise bursts —
//    a rising hum while a strike telegraphs, a crack-and-rumble thunderclap
//    when it lands, a bright zap arpeggio on harvest, thuds, dash whoosh,
//    the Storm Lance's rising charge shot, and win / lose stingers.
// The context is created lazily on the first user gesture (browser policy);
// until then every call is a safe no-op. M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let ambient = null; // { noiseGain, droneOsc, droneGain }
  let muted = false;
  let intensity = 0.4;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      startAmbient();
      return true;
    } catch { return false; }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      // Pinkish noise: white noise smoothed, so wind sounds like wind, not hiss.
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  function startAmbient() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3); src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 0.4;
    const gain = ctx.createGain(); gain.gain.value = 0.05 + intensity * 0.06;
    src.connect(filter); filter.connect(gain); gain.connect(master); src.start();
    const drone = ctx.createOscillator(); drone.type = 'triangle'; drone.frequency.value = 55;
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.018;
    drone.connect(droneGain); droneGain.connect(master); drone.start();
    // Slow breathing on the wind so the loop never feels mechanical.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain); lfoGain.connect(gain.gain); lfo.start();
    ambient = { noiseGain: gain, droneOsc: drone, droneGain };
  }

  function tone(freqA, freqB, dur, type, vol, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function burst(dur, freq, vol, delay = 0, type = 'lowpass') {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  return {
    /** Call from any click / keypress handler so the context can start. */
    unlock() { ensure(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.03);
      return muted;
    },
    /** 0..1 — later storms sound angrier. */
    setIntensity(value) {
      intensity = value;
      if (ambient && ctx) ambient.noiseGain.gain.setTargetAtTime(0.05 + value * 0.075, ctx.currentTime, 0.4);
    },
    click() { tone(660, 520, 0.07, 'square', 0.08); },
    telegraphHum() { tone(180, 720, 0.5, 'sawtooth', 0.035); },
    thunder(mega) { burst(0.16, 3200, 0.5, 0, 'highpass'); burst(mega ? 1.1 : 0.7, 180, 0.65, 0.02); },
    harvest() { tone(880, 880, 0.09, 'square', 0.12); tone(1320, 1320, 0.1, 'square', 0.1, 0.06); tone(1760, 1980, 0.14, 'square', 0.09, 0.12); burst(0.2, 2400, 0.08, 0, 'bandpass'); },
    hit() { burst(0.25, 300, 0.4); tone(160, 60, 0.25, 'sawtooth', 0.2); },
    dash() { burst(0.22, 900, 0.16, 0, 'bandpass'); },
    draft() { tone(523, 523, 0.12, 'triangle', 0.14); tone(784, 784, 0.16, 'triangle', 0.14, 0.09); },
    lanceReady() { tone(440, 1320, 0.4, 'sawtooth', 0.1); },
    lanceFire() { tone(1400, 180, 0.55, 'sawtooth', 0.3); burst(0.5, 500, 0.4, 0.05); tone(90, 40, 0.6, 'square', 0.25, 0.05); },
    bossHit() { burst(0.8, 220, 0.6); tone(220, 45, 0.8, 'sawtooth', 0.3); },
    stormClear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.13, i * 0.09)); },
    win() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.14, i * 0.11)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.94, 0.34, 'triangle', 0.15, i * 0.16)); },
  };
}
