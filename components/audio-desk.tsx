"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, VolumeX } from "lucide-react";

import type { Atmosphere } from "@/lib/atmosphere/schema";
import { Button } from "@/components/ui/button";

type Texture = Atmosphere["audio"];

class RoomTone {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private nodes: AudioNode[] = [];
  private oscillators: OscillatorNode[] = [];

  async start(texture: Texture) {
    const context = this.context ?? new AudioContext();
    this.context = context;
    if (context.state === "suspended") await context.resume();
    this.teardownGraph();

    const master = context.createGain();
    master.gain.value = 0.9;
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    master.connect(analyser);
    analyser.connect(context.destination);
    this.master = master;
    this.analyser = analyser;

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = texture.tempoBpm / 60;
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();
    this.oscillators.push(lfo);

    texture.frequencies.slice(0, 5).forEach((frequency, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.detune.value = index % 2 === 0 ? -6 : 7;
      gain.gain.value = index === 0 ? 0.22 : 0.07;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      this.oscillators.push(osc);
      this.nodes.push(gain);
    });

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = texture.filterHz;
    filter.Q.value = 0.7;
    const noiseGain = context.createGain();
    noiseGain.gain.value = texture.noise * 0.18;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    this.nodes.push(noise, filter, noiseGain);
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

  private teardownGraph() {
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

export function AudioDesk({
  texture,
  ink,
}: {
  texture: Texture | null;
  ink: string;
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

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={!texture}
        aria-pressed={on}
        onClick={() => setOn((value) => !value)}
        className="h-10 border-white/20 bg-black/40 text-[color:var(--room-ink)] hover:bg-white/10"
      >
        {on ? <VolumeX /> : <AudioLines />}
        {on ? "Silence" : "Sound the room"}
      </Button>
      <div className="flex h-8 items-end gap-1" aria-hidden>
        {bars.map((bar, index) => (
          <span
            key={index}
            className="w-1 rounded-full"
            style={{
              height: `${Math.max(4, bar * 32)}px`,
              background: ink,
              opacity: on ? 0.85 : 0.25,
            }}
          />
        ))}
      </div>
    </div>
  );
}
