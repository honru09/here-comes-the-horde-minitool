/* 《群尸来压境》离线 Web Audio 战斗音效与背景战鼓引擎（已移除人物语音包，100% 兼容 Chrome 61 & iOS） */
(function (global) {
  'use strict';

  var ctx = null;
  var bgmTimer = 0;
  var bgmStep = 0;
  var settings = {
    master: 80,
    sfx: 80,
    music: 45
  };

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* 忽略 */ }
      }
      return ctx;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function applySettings(next) {
    if (!next) return;
    if (typeof next.master === 'number') settings.master = next.master;
    if (typeof next.sfx === 'number') settings.sfx = next.sfx;
    if (typeof next.music === 'number') settings.music = next.music;
  }

  function vol(channel) {
    var m = Math.max(0, Math.min(100, settings.master)) / 100;
    var c = Math.max(0, Math.min(100, settings[channel])) / 100;
    return m * c;
  }

  function playTone(freq, freqEnd, duration, type, gainVal, delay) {
    var ac = ensureContext();
    if (!ac || gainVal <= 0.002) return;
    var t0 = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd && freqEnd !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainVal, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playClick() {
    playTone(520, 380, 0.05, 'triangle', vol('sfx') * 0.13, 0);
  }

  function playBuild() {
    var v = vol('sfx') * 0.22;
    playTone(170, 75, 0.11, 'square', v, 0);
    playTone(320, 480, 0.09, 'triangle', v * 0.7, 0.05);
  }

  function playUpgrade() {
    var v = vol('sfx') * 0.2;
    playTone(440, 440, 0.08, 'triangle', v, 0);
    playTone(554, 554, 0.08, 'triangle', v, 0.06);
    playTone(659, 880, 0.15, 'triangle', v * 1.1, 0.12);
  }

  function playAbility() {
    var v = vol('sfx') * 0.25;
    playTone(220, 660, 0.25, 'sawtooth', v * 0.55, 0);
    playTone(330, 880, 0.28, 'triangle', v * 0.75, 0.05);
  }

  function playBombWave() {
    var v = vol('sfx') * 0.32;
    playTone(140, 38, 0.45, 'sawtooth', v, 0);
    playTone(520, 1040, 0.35, 'triangle', v * 0.72, 0.06);
    playTone(784, 1568, 0.4, 'sine', v * 0.52, 0.14);
  }

  function playVictory() {
    var v = vol('sfx') * 0.22;
    var notes = [392, 523, 659, 784];
    for (var i = 0; i < notes.length; i += 1) {
      playTone(notes[i], notes[i], 0.22, 'triangle', v, i * 0.11);
    }
  }

  function playDefeat() {
    var v = vol('sfx') * 0.22;
    playTone(293, 261, 0.24, 'sawtooth', v * 0.6, 0);
    playTone(246, 174, 0.4, 'sawtooth', v * 0.65, 0.22);
  }

  var BGM_NOTES = [146.8, 174.6, 220, 174.6, 196, 220, 164.8, 146.8];
  function startBgm() {
    if (bgmTimer) return;
    bgmTimer = setInterval(function () {
      var v = vol('music');
      if (v <= 0.01 || document.hidden) return;
      var note = BGM_NOTES[bgmStep % BGM_NOTES.length];
      playTone(note, note * 0.99, 0.36, 'triangle', v * 0.075, 0);
      if (bgmStep % 2 === 0) {
        playTone(74, 48, 0.12, 'sine', v * 0.11, 0);
      }
      bgmStep += 1;
    }, 480);
  }

  function stopBgm() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = 0;
    }
  }

  global.HORDE_AUDIO = {
    unlock: ensureContext,
    applySettings: applySettings,
    playClick: playClick,
    playBuild: playBuild,
    playUpgrade: playUpgrade,
    playAbility: playAbility,
    playBombWave: playBombWave,
    playVictory: playVictory,
    playDefeat: playDefeat,
    startBgm: startBgm,
    stopBgm: stopBgm
  };
})(window);
