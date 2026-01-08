
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Browser does not support camera access.");
        return;
      }

      try {
        // Simple constraints are often more reliable in mobile WebViews/APKs
        const constraints = {
          video: { 
            facingMode: 'user',
            width: { ideal: 640 }, 
            height: { ideal: 480 } 
          },
          audio: false
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!mounted) {
          mediaStream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = mediaStream;

        if (videoRef.current) {
          const video = videoRef.current;
          video.srcObject = mediaStream;
          
          // Use both events to ensure initialization finishes
          const onReady = () => {
            if (mounted) {
              setIsCameraReady(true);
              video.play().catch(e => console.warn("Auto-play blocked", e));
            }
          };

          video.onloadedmetadata = onReady;
          video.oncanplay = onReady;
        }
      } catch (err: any) {
        if (mounted) {
          console.error("Camera Setup Error:", err);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError("Permission Denied. Please enable camera in your phone settings.");
          } else {
            setError(`Camera Error: ${err.message || "Failed to start"}`);
          }
        }
      }
    }

    setupCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing || !isCameraReady) return;
    
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 100);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Low latency context settings
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    
    if (ctx && video.videoWidth > 0) {
      // Scale down for faster processing
      canvas.width = 400;
      canvas.height = (video.videoHeight / video.videoWidth) * 400;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      
      try {
        const result = await geminiService.identifyStaff(base64Data, staffList);
        onResult(result);
      } catch (err: any) {
        onResult({ identified: false, confidence: 0, message: "Biometric fail." });
      }
    }
  }, [isProcessing, onResult, staffList, isCameraReady]);

  return (
    <div className="relative w-full max-w-md mx-auto overflow-hidden rounded-[40px] bg-slate-900 aspect-[4/5] shadow-2xl border-[10px] border-slate-900">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-slate-400">
          <p className="font-bold text-rose-500 mb-6 text-xs uppercase tracking-widest leading-relaxed">{error}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-slate-800 text-white rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 active:scale-95 transition-all">RETRY</button>
        </div>
      ) : (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`w-full h-full object-cover transition-opacity duration-500 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`} 
          />
          
          {!isCameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
              <div className="w-8 h-8 border-[3px] border-white/10 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
              <p className="text-[8px] font-black text-white/30 uppercase tracking-[4px]">Initializing Lens</p>
            </div>
          )}

          {showFlash && <div className="absolute inset-0 bg-white z-[60] animate-out fade-out duration-200"></div>}

          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <div className="w-60 h-72 border-2 border-white/20 rounded-[40px] relative">
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900/60 backdrop-blur px-3 py-1 rounded-full text-[8px] font-black text-white uppercase tracking-widest border border-white/10">Align Face</div>
             </div>
          </div>

          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-20">
            <button
              onClick={captureFrame}
              disabled={isProcessing || !isCameraReady}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isProcessing || !isCameraReady ? 'bg-slate-800' : 'bg-white shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-90'}`}
            >
              {isProcessing ? (
                <div className="w-6 h-6 border-4 border-slate-600 border-t-indigo-500 rounded-full animate-spin"></div>
              ) : (
                <div className="w-10 h-10 rounded-full border-2 border-indigo-500"></div>
              )}
            </button>
            <p className="text-[8px] font-black uppercase tracking-[3px] text-white/40">{isProcessing ? 'Analyzing' : 'Ready'}</p>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
