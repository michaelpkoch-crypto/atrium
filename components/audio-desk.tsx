"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, VolumeX } from "lucide-react";

import type { SoundBed } from "@/lib/atmosphere/channels";
import type { Atmosphere } from "@/lib/atmosphere/schema";
import type { TextureKind } from "@/lib/atmosphere/families";
import { Button } from "@/components/ui/button";

type Texture = Atmosphere["audio"];

class RoomTone {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private nodes: AudioNode[] = [];
  private oscillators: OscillatorNode[] = [];
  private timers: number[] = [];

  async start(texture: Texture) {
    const context = this.context ?? new AudioContext();
    this.context = context;
    if (context.state === "suspended") await context.resume();
    this.teardownGraph();

    const master = context.createGain();
    master.gain.value = 0.85;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 2.5;
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    master.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(context.destination);
    this.master = master;
    this.analyser = analyser;
    this.nodes.push(compressor);

    const padBus = context.createGain();
    padBus.gain.value = 0.9;
    const padFilter = context.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    const sweep = context.createOscillator();
    const sweepGain = context.createGain();
    sweep.frequency.value = 0.05;
    sweepGain.gain.value = 280;
    sweep.connect(sweepGain);
    sweepGain.connect(padFilter.frequency);
    sweep.start();
    padBus.connect(padFilter);
    padFilter.connect(master);
    this.oscillators.push(sweep);
    this.nodes.push(padBus, padFilter, sweepGain);

    texture.frequencies.slice(0, 5).forEach((frequency, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = index === 0 ? "sine" : "triangle";
      osc.frequency.value = frequency;
      osc.detune.value = index % 2 === 0 ? -7 : 8;
      gain.gain.value = index === 0 ? 0.16 : 0.045;
      osc.connect(gain);
      gain.connect(padBus);
      osc.start();
      this.oscillators.push(osc);
      this.nodes.push(gain);
    });

    this.textureLayer(context, master, texture.texture, texture.noise, texture.filterHz);
    this.beds(context, master, texture.beds, texture.texture);
    this.pulse(context, master, texture.tempoBpm);
  }

  stop() {
    this.teardownGraph();
    void this.context?.suspend();
  }

  bars(): number[] {
    if (!this.analyser) return Array.from({ length: 12 }, () => 0);
    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);
    return Array.from(bins.slice(0, 12), (value) => value / 255);
  }

  private textureLayer(context: AudioContext, master: GainNode, kind: TextureKind, amount: number, filterHz: number) {
    const noise = loopNoise(context);
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    if (kind === "rain") {
      filter.type = "highpass";
      filter.frequency.value = Math.max(1400, filterHz);
      gain.gain.value = 0.05 + amount * 0.12;
      const drops = context.createBufferSource();
      drops.buffer = spikes(context, 50);
      drops.loop = true;
      drops.connect(gain.gain);
      drops.start();
      this.nodes.push(drops);
    } else if (kind === "tape") {
      filter.type = "highpass";
      filter.frequency.value = Math.max(2800, filterHz);
      gain.gain.value = 0.02 + amount * 0.05;
    } else if (kind === "vinyl") {
      filter.type = "bandpass";
      filter.frequency.value = 2200;
      filter.Q.value = 0.4;
      gain.gain.value = 0.03 + amount * 0.08;
      const clicks = context.createBufferSource();
      clicks.buffer = spikes(context, 14);
      clicks.loop = true;
      const clickGain = context.createGain();
      clickGain.gain.value = 0.04;
      clicks.connect(clickGain);
      clickGain.connect(master);
      clicks.start();
      this.nodes.push(clicks, clickGain);
    } else if (kind === "crowd") {
      filter.type = "bandpass";
      filter.frequency.value = 520;
      filter.Q.value = 0.7;
      gain.gain.value = 0.04 + amount * 0.1;
      this.wobble(context, gain.gain, 0.18, 0.03);
    } else if (kind === "water" || kind === "steam") {
      filter.type = "lowpass";
      filter.frequency.value = kind === "steam" ? 1400 : 780;
      gain.gain.value = 0.04 + amount * 0.1;
      this.wobble(context, gain.gain, kind === "steam" ? 0.12 : 0.08, 0.025);
    } else {
      filter.type = "lowpass";
      filter.frequency.value = 640;
      gain.gain.value = 0.015 + amount * 0.04;
    }
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start();
    this.nodes.push(noise, filter, gain);
  }

  private wobble(context: AudioContext, param: AudioParam, rate: number, depth: number) {
    const lfo = context.createOscillator();
    const gain = context.createGain();
    lfo.frequency.value = rate;
    gain.gain.value = depth;
    lfo.connect(gain);
    gain.connect(param);
    lfo.start();
    this.oscillators.push(lfo);
    this.nodes.push(gain);
  }

  private beds(context: AudioContext, master: GainNode, beds: SoundBed[], texture: TextureKind) {
    const wanted = new Set(beds);
    if (wanted.has("drone")) {
      for (const frequency of [110, 155.56]) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.value = 0.07;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        this.oscillators.push(osc);
        this.nodes.push(gain);
      }
    }
    if (wanted.has("wind")) this.noiseBed(context, master, "highpass", 1400, 0.06, true);
    if (wanted.has("murmur")) this.noiseBed(context, master, "bandpass", 480, 0.05, true);
    if (wanted.has("fire")) this.noiseBed(context, master, "lowpass", 700, 0.06, false);
    if (wanted.has("vinyl") && texture !== "vinyl") this.noiseBed(context, master, "bandpass", 2200, 0.04, false);
    if (wanted.has("rain") && texture !== "rain") this.noiseBed(context, master, "highpass", 1800, 0.05, false);
    if (wanted.has("creak")) this.occasional(context, master, 8000, 180, 0.08);
    if (wanted.has("thunder")) this.occasional(context, master, 12000, 55, 0.16);
    if (wanted.has("chime")) this.occasional(context, master, 9000, 880, 0.05);
  }

  private noiseBed(
    context: AudioContext,
    master: GainNode,
    type: BiquadFilterType,
    frequency: number,
    amount: number,
    wobble: boolean,
  ) {
    const noise = loopNoise(context);
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = type;
    filter.frequency.value = frequency;
    if (type === "bandpass") filter.Q.value = 0.7;
    gain.gain.value = amount;
    if (wobble) this.wobble(context, filter.frequency, 0.08, frequency * 0.18);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start();
    this.nodes.push(noise, filter, gain);
  }

  private occasional(context: AudioContext, master: GainNode, everyMs: number, frequency: number, peak: number) {
    const osc = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    osc.type = frequency < 100 ? "sine" : "triangle";
    osc.frequency.value = frequency;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 4;
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    this.oscillators.push(osc);
    this.nodes.push(filter, gain);
    const timer = window.setInterval(() => {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (frequency < 100 ? 1.4 : 0.45));
    }, everyMs);
    this.timers.push(timer);
  }

  private pulse(context: AudioContext, master: GainNode, bpm: number) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = 78;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    this.oscillators.push(osc);
    this.nodes.push(gain);
    const interval = Math.max(280, 60000 / bpm);
    const timer = window.setInterval(() => {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    }, interval);
    this.timers.push(timer);
  }

  private teardownGraph() {
    for (const timer of this.timers) window.clearInterval(timer);
    this.timers = [];
    for (const osc of this.oscillators) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      osc.disconnect();
    }
    this.oscillators = [];
    for (const node of this.nodes) node.disconnect();
    this.nodes = [];
    this.master?.disconnect();
    this.analyser?.disconnect();
    this.master = null;
    this.analyser = null;
  }
}

function loopNoise(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function spikes(context: AudioContext, count: number) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < count; i += 1) {
    const at = Math.floor(Math.random() * (data.length - 8));
    data[at] = 1;
    data[at + 1] = 0.45;
    data[at + 2] = 0.15;
  }
  return buffer;
}

export function AudioDesk({
  texture,
  inspiredBy,
  empty,
}: {
  texture: Texture | null;
  inspiredBy: string[];
  empty?: string;
}) {
  const engine = useRef<RoomTone | null>(null);
  const [on, setOn] = useState(false);
  const [bars, setBars] = useState<number[]>(Array.from({ length: 12 }, () => 0));

  useEffect(() => {
    if (!on || !texture) return;
    const tone = engine.current ?? new RoomTone();
    engine.current = tone;
    let frame = 0;
    let cancelled = false;
    void tone.start(texture).then(() => {
      if (cancelled) tone.stop();
    });
    const tick = () => {
      setBars(tone.bars());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      tone.stop();
    };
  }, [on, texture]);

  const names = inspiredBy.filter(Boolean).slice(0, 3);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!texture}
          aria-pressed={on}
          onClick={() => setOn((value) => !value)}
          className="h-10 border-white/20 bg-black/40 text-white hover:bg-white/10"
        >
          {on ? <VolumeX /> : <AudioLines />}
          {on ? "Silence" : "Play the room"}
        </Button>
        <div className="flex h-8 items-end gap-1" aria-hidden>
          {bars.map((bar, index) => (
            <span
              key={index}
              className="w-1 rounded-full bg-white"
              style={{ height: `${Math.max(4, bar * 32)}px`, opacity: on ? 0.85 : 0.25 }}
            />
          ))}
        </div>
      </div>
      {texture ? (
        <>
          <p className="text-sm leading-5 text-white">{texture.nowPlaying}</p>
          <p className="text-xs leading-5 text-white/70">
            {texture.description}
            {names.length && !/inspired by/i.test(texture.nowPlaying) ? ` Inspired by ${names.join(", ")}.` : ""}
          </p>
        </>
      ) : (
        <p className="text-xs text-white/55">{empty ?? "The bed starts after a room is compiled. It is synthesized, not a recording."}</p>
      )}
    </div>
  );
}
