
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { geminiService } from '../services/geminiService';
import { RecognitionResult, StaffMember } from '../types';

interface CameraScannerProps {
  onResult: (result: RecognitionResult) => void;
  isProcessing: boolean;
  staffList: StaffMember[];
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onResult, isProcessing, staffList }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  
  // Zoom States (Retained for precision as requested previously)
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [supportsZoom, setSupportsZoom] = useState(false);

  useEffect(() => {
    async function setupCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 960 }
          },
          audio: false
        });
        
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        const videoTrack = mediaStream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities() as any;
        
        if (capabilities.zoom) {
          setSupportsZoom(true);
          setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max });
          setZoom(capabilities.zoom.min);
        }
      } catch (err) {
        console.error("Camera error:", err);
        setError("Camera access is required. Please ensure permissions are granted.");
      }
    }
    setupCamera();

    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const handleZoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setZoom(value);
    
    if (stream) {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      if (capabilities.zoom) {
        track.applyConstraints({
          advanced: [{ zoom: value }]
        } as any);
      }
    }
  }, [stream]);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    // Visual Flash
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64Data = dataUrl.split(',')[1];
      
      try {
        const result = await geminiService.identifyStaff(base64Data, staffList);
        onResult(result);
      } catch (err: any) {
        onResult({ 
          identified: false, 
          confidence: 0, 
          message: err.message || "Recognition failed." 
        });
      }
    }
  }, [isProcessing, onResult, staffList]);

  return (
    <div className="relative w-full max-w-md mx-auto overflow-hidden rounded-[40px] bg-slate-900 aspect-[3/4] shadow-2xl border-[12px] border-slate-900 group">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-10 text-center text-slate-400">
          <p className="font-bold text-rose-500">{error}</p>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          
          {/* Visual Flash Effect */}
          {showFlash && (
            <div className="absolute inset-0 bg-white z-[60] animate-pulse"></div>
          )}

          {/* Visual Framing Guides */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <div className="w-64 h-80 border border-white/20 rounded-[40px] relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/80 backdrop-blur px-3 py-1 rounded-full text-[8px] font-black text-white uppercase tracking-widest">
                  Position Face Here
                </div>
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/60 rounded-tl-3xl"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/60 rounded-tr-3xl"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/60 rounded-bl-3xl"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/60 rounded-br-3xl"></div>
             </div>
          </div>

          {/* Zoom Controls Overlay */}
          {supportsZoom && (
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 bg-black/40 backdrop-blur-md p-3 rounded-full border border-white/10">
              <span className="text-white text-[10px] font-black">+</span>
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step="0.1"
                value={zoom}
                onChange={handleZoomChange}
                className="h-32 appearance-none bg-white/20 rounded-lg w-1.5 focus:outline-none accent-indigo-500 cursor-pointer"
                style={{ WebkitAppearance: 'slider-vertical' } as any}
              />
              <span className="text-white text-[10px] font-black">-</span>
            </div>
          )}

          {/* Status Bar */}
          <div className="absolute top-8 left-8 z-20">
             <div className="bg-black/60 backdrop-blur-lg px-4 py-2 rounded-2xl text-[10px] text-white font-black uppercase tracking-widest flex items-center gap-2 border border-white/10">
                <span className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                {isProcessing ? 'Processing...' : 'Ready to Scan'}
             </div>
          </div>

          {/* Large Manual Capture Button */}
          <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-4 px-8 z-20">
            <button
              onClick={captureFrame}
              disabled={isProcessing}
              className={`w-full py-5 rounded-[24px] font-black text-sm uppercase tracking-[3px] transition-all flex items-center justify-center gap-3 shadow-2xl
                ${isProcessing 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 hover:shadow-indigo-500/40'}`}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Verifying...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  Mark Attendance
                </>
              )}
            </button>
            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">
              Tap Button to capture & confirm identity
            </p>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
