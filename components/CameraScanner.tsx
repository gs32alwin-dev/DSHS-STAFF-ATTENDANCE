
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
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function setupCamera() {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: false
        });
        if (!mounted) {
          mediaStream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            if (mounted) {
              setIsCameraReady(true);
              videoRef.current?.play().catch(() => {});
            }
          };
        }
      } catch (err: any) {
        if (mounted) setError("System access denied.");
      }
    }
    setupCamera();
    return () => {
      mounted = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing || !isCameraReady) return;
    
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 100);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    
    if (ctx && video.videoWidth > 0) {
      canvas.width = 400;
      canvas.height = (video.videoHeight / video.videoWidth) * 400;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      
      try {
        const result = await geminiService.identifyStaff(base64Data, staffList);
        onResult(result);
      } catch (err: any) {
        onResult({ identified: false, confidence: 0, message: "Biometric Failure" });
      }
    }
  }, [isProcessing, onResult, staffList, isCameraReady]);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-black">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center bg-slate-950">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mb-6">
             <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <p className="font-bold text-white mb-8 text-sm uppercase tracking-widest">{error}</p>
          <button onClick={() => window.location.reload()} className="px-12 py-5 bg-white text-black rounded-3xl text-[10px] font-black uppercase tracking-[4px] active:scale-95 transition-all">Reload Optic</button>
        </div>
      ) : (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`absolute inset-0 w-full h-full object-cover grayscale-[0.3] brightness-[0.8] transition-all duration-1000 ${isCameraReady ? 'opacity-100 scale-100' : 'opacity-0 scale-110'}`} 
          />
          
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-black/80"></div>

          {!isCameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
              <div className="w-14 h-14 border-[3px] border-white/5 border-t-white rounded-full animate-spin"></div>
            </div>
          )}

          {showFlash && <div className="absolute inset-0 bg-white z-[60] animate-out fade-out duration-200"></div>}

          {/* DYNAMIC BIOMETRIC OVERLAY */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
             <div className={`w-[78vw] h-[105vw] border-2 rounded-[60px] relative transition-all duration-500 ${isProcessing ? 'scanning-active scale-105' : 'border-white/10'}`}>
                {/* CYBERPUNK CORNERS */}
                <div className="absolute -top-1 -left-1 w-16 h-16 border-t-[6px] border-l-[6px] border-indigo-500 rounded-tl-[40px] shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                <div className="absolute -top-1 -right-1 w-16 h-16 border-t-[6px] border-r-[6px] border-indigo-500 rounded-tr-[40px] shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                <div className="absolute -bottom-1 -left-1 w-16 h-16 border-b-[6px] border-l-[6px] border-indigo-500 rounded-bl-[40px] shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                <div className="absolute -bottom-1 -right-1 w-16 h-16 border-b-[6px] border-r-[6px] border-indigo-500 rounded-br-[40px] shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                
                {/* SCANNING LIGHT BAR */}
                {isProcessing && (
                  <div className="absolute inset-x-8 top-0 h-[3px] bg-indigo-400 shadow-[0_0_25px_#818cf8] animate-[scan_2.5s_ease-in-out_infinite] opacity-80"></div>
                )}
                
                {/* TECH DECORATION */}
                <div className="absolute top-1/2 -left-3 w-1.5 h-16 bg-white/10 rounded-full"></div>
                <div className="absolute top-1/2 -right-3 w-1.5 h-16 bg-white/10 rounded-full"></div>
             </div>
          </div>

          {/* DYNAMIC HUD */}
          <div className="absolute bottom-52 left-12 right-12 flex items-center justify-between pointer-events-none z-30 opacity-40">
             <div className="flex flex-col gap-1">
                <p className="text-[7px] font-black uppercase tracking-[3px] text-white/60">Lat/Lon</p>
                <p className="text-[10px] font-mono text-white/40">37.7749° N, 122.4194° W</p>
             </div>
             <div className="text-right flex flex-col gap-1">
                <p className="text-[7px] font-black uppercase tracking-[3px] text-white/60">Bitrate</p>
                <p className="text-[10px] font-mono text-white/40">14.2 MBPS</p>
             </div>
          </div>

          <div className="absolute bottom-36 left-0 right-0 flex flex-col items-center gap-8 z-30">
            <button
              onClick={captureFrame}
              disabled={isProcessing || !isCameraReady}
              className={`w-28 h-28 rounded-full flex items-center justify-center transition-all p-1 relative ${isProcessing || !isCameraReady ? 'opacity-40 scale-90' : 'active:scale-90 group'}`}
            >
               {/* OUTER RING */}
               <div className={`absolute inset-0 rounded-full border-[2px] ${isProcessing ? 'border-indigo-500 animate-spin border-t-transparent' : 'border-white/20 transition-colors group-hover:border-white/40'}`}></div>
               
               {/* INNER BUTTON */}
               <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-2xl ${isProcessing ? 'bg-slate-800' : 'bg-white group-hover:bg-indigo-50'}`}>
                 {isProcessing ? (
                   <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                 ) : (
                   <div className="w-10 h-10 border-2 border-black/10 rounded-full"></div>
                 )}
               </div>
            </button>
            <div className="glass-dark px-8 py-3 rounded-full border border-white/10 shadow-2xl">
              <p className="text-[10px] font-black uppercase tracking-[5px] text-white/90">{isProcessing ? 'Analyzing Data' : 'Initialize Scan'}</p>
            </div>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
      <style>{`
        @keyframes scan {
          0%, 100% { top: 15%; opacity: 0.1; }
          50% { top: 85%; opacity: 1; }
        }
      `}</style>
    </div>
  );
};
