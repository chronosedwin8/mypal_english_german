"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Deteccion de objetos 100 % en el navegador (TensorFlow.js + COCO-SSD).
 * La imagen de la camara nunca sale del dispositivo. Se carga solo al pedirla.
 */
export interface Detection {
  label: string;
  score: number;
  /** caja en pixeles del video original */
  box: [number, number, number, number];
}

type Status = "off" | "starting" | "loading-model" | "on" | "denied" | "error";

export function useObjectDetection() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<Status>("off");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [videoSize, setVideoSize] = useState({ w: 640, h: 480 });

  const stop = useCallback(() => {
    if (loopRef.current) clearTimeout(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setDetections([]);
    setStatus("off");
  }, []);

  const start = useCallback(async () => {
    setStatus("starting");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
    } catch {
      setStatus("denied");
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = streamRef.current;
    await video.play().catch(() => undefined);
    setVideoSize({ w: video.videoWidth || 640, h: video.videoHeight || 480 });

    setStatus("loading-model");
    try {
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-cpu");
      await import("@tensorflow/tfjs-backend-webgl");
      await import("@tensorflow/tfjs-converter");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      // WebGL (GPU) si esta disponible; si no, CPU (mas lento, pero funciona).
      const gpu = await tf.setBackend("webgl").catch(() => false);
      if (!gpu) await tf.setBackend("cpu");
      await tf.ready();
      const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      setStatus("on");
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        if (videoRef.current.readyState >= 2) {
          const preds = await model.detect(videoRef.current, 6, 0.5);
          setDetections(preds.map((p) => ({ label: p.class, score: p.score, box: p.bbox as Detection["box"] })));
        }
        loopRef.current = setTimeout(tick, 350);
      };
      void tick();
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, videoSize, status, detections, start, stop };
}
