
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

      try {
        const constraints = {
          video: { 
            facingMode: 'user', 
            width: { ideal: 1920 }, 
            height: { ideal: 1080 } 
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
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            if (mounted) {
              setIsCameraReady(true);
              videoRef.current?.play().catch(() => {});
            }
          };
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.name === 'NotAllowedError' ? "Camera access denied." : "Hardware initialization failed.");
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
    setTimeout(() => setShowFlash(false), 80);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // We want to capture what the user sees. 
    // Since the video is object-cover, we need to crop the center part for the API
    const ctx = canvas.getContext('2d', { alpha: false });
    
    if (ctx && video.videoWidth > 0) {
      // Create a square capture from the center of the video for best biometric results
      const size = Math.min(video.videoWidth, video.videoHeight);
      const startX = (video.videoWidth - size) / 2;
      const startY = (video.videoHeight - size) / 2;
      
      canvas.width = 640;
      canvas.height = 640;
      
      ctx.drawImage(
        video, 
        startX, startY, size, size, // source
        0, 0, 640, 640              // destination
      );
      
      const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      try {
        const result = await geminiService.identifyStaff(base64Data, staffList);
        onResult(result);
      } catch (err: any) {
        onResult({ identified: false, confidence: 0, message: "Network interference." });
      }
    }
  }, [isProcessing, onResult, staffList, isCameraReady]);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-black flex items-center justify-center">
      {/* BACKGROUND DEPTH */}
      <div className="absolute inset-0 bg-[#020617]">
         <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      </div>

      {error ? (
        <div className="relative z-50 flex flex-col items-center justify-center p-12 text-center bg-black/60 backdrop-blur-xl rounded-[40px] border border-white/5 mx-6">
          <div className="w-20 h-20 rounded-3xl bg-rose-500/10 flex items-center justify-center mb-8 border border-rose-500/20 shadow-2xl">
             <svg className="w-10 h-10 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Terminal Offline</h3>
          <p className="font-medium text-white/30 mb-10 text-[10px] uppercase tracking-widest leading-relaxed max-w-[200px]">{error}</p>
          <button onClick={() => window.location.reload()} className="px-10 py-5 bg-white text-black rounded-2xl text-[9px] font-black uppercase tracking-[5px] active:scale-95 transition-all shadow-2xl">Reconnect Sensor</button>
        </div>
      ) : (
        <>
          {/* FULL SCREEN PORTRAIT VIDEO FEED */}
          <div className="absolute inset-0 w-full h-full">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`w-full h-full object-cover grayscale-[0.2] brightness-[0.9] transition-opacity duration-1000 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`} 
            />
            
            {/* VIGNETTE OVERLAY */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>
          </div>

          {!isCameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
              <div className="w-12 h-12 border-2 border-white/5 border-t-indigo-500 rounded-full animate-spin"></div>
              <p className="mt-6 text-[8px] font-black text-white/20 uppercase tracking-[6px]">Syncing Optics</p>
            </div>
          )}

          {showFlash && <div className="absolute inset-0 bg-white z-[60] animate-out fade-out duration-300"></div>}

          {/* BIOMETRIC VIEWPORT HUD */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
             <div className={`w-[75vw] h-[75vw] sm:w-[420px] sm:h-[420px] border-2 rounded-[64px] relative transition-all duration-700 ${isProcessing ? 'border-indigo-500/50 scale-105 shadow-[0_0_100px_rgba(99,102,241,0.2)]' : 'border-white/5'}`}>
                
                {/* Minimal Corner Brackets */}
                <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-indigo-500 rounded-tl-[40px]"></div>
                <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-indigo-500 rounded-tr-[40px]"></div>
                <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-indigo-500 rounded-bl-[40px]"></div>
                <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-indigo-500 rounded-br-[40px]"></div>
                
                {/* SCANNING LINE */}
                {isProcessing && (
                  <div className="absolute inset-x-10 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_40px_rgba(99,102,241,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                )}
             </div>
          </div>

          {/* HUD CORNER DATA */}
          <div className="absolute inset-x-12 top-28 bottom-56 pointer-events-none flex flex-col justify-between z-30 opacity-20">
             <div className="flex justify-between items-start">
                <p className="text-[7px] font-mono text-white uppercase tracking-widest">CAM_LINK_STABLE</p>
                <p className="text-[7px] font-mono text-white uppercase tracking-widest">ID_SCAN_V2.0</p>
             </div>
          </div>

          {/* CAPTURE CONTROL - AT BOTTOM */}
          <div className="absolute bottom-36 left-0 right-0 flex flex-col items-center z-50">
            <button
              onClick={captureFrame}
              disabled={isProcessing || !isCameraReady}
              className={`w-28 h-28 rounded-full flex items-center justify-center transition-all p-2 relative group ${isProcessing || !isCameraReady ? 'opacity-40 pointer-events-none' : 'active:scale-95'}`}
            >
               <div className={`absolute inset-0 rounded-full border-2 transition-all duration-500 ${isProcessing ? 'border-indigo-500 animate-spin border-t-transparent' : 'border-white/20 group-hover:border-white/40 shadow-[0_0_30px_rgba(255,255,255,0.1)]'}`}></div>
               
               <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isProcessing ? 'bg-slate-900' : 'bg-white shadow-[0_0_40px_rgba(255,255,255,0.3)]'}`}>
                 {isProcessing ? (
                   <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                 ) : (
                   <div className="w-8 h-8 border border-black/5 rounded-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600/30 animate-pulse"></div>
                   </div>
                 )}
               </div>
            </button>
            
            {isProcessing && (
              <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="text-[8px] font-black uppercase tracking-[4px] text-indigo-400">Syncing Biometrics...</p>
              </div>
            )}
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};
