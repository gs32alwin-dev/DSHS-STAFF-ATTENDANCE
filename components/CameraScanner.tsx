
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
              videoRef.current?.play().catch(e => console.warn("Autoplay interrupted", e));
            }
          };
        }
      } catch (err: any) {
        if (mounted) {
          console.error("Camera Error:", err);
          setError(err.name === 'NotAllowedError' ? "Camera access denied. Enable it in settings." : "Biometric sensor offline.");
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
    const ctx = canvas.getContext('2d', { alpha: false });
    
    if (ctx && video.videoWidth > 0) {
      // Capture at a reasonably high resolution but scaled for Gemini
      const aspect = video.videoHeight / video.videoWidth;
      canvas.width = 640;
      canvas.height = 640 * aspect;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-[#020617] flex items-center justify-center">
      {/* TECH BACKGROUND PATTERN FOR LETTERBOXING */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}>
      </div>

      {error ? (
        <div className="relative z-50 flex flex-col items-center justify-center p-12 text-center">
          <div className="w-20 h-20 rounded-[32px] bg-rose-500/10 flex items-center justify-center mb-8 border border-rose-500/20 shadow-2xl">
             <svg className="w-10 h-10 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Sensor Error</h3>
          <p className="font-medium text-white/40 mb-10 text-xs uppercase tracking-widest max-w-[240px] leading-relaxed">{error}</p>
          <button onClick={() => window.location.reload()} className="px-12 py-5 bg-white text-black rounded-[24px] text-[10px] font-black uppercase tracking-[5px] active:scale-95 transition-all shadow-xl">Re-Link System</button>
        </div>
      ) : (
        <>
          {/* CAMERA FEED - NOW FITTED NOT ZOOOMED */}
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`w-full h-full object-contain grayscale-[0.2] brightness-[0.9] transition-all duration-1000 ${isCameraReady ? 'opacity-100' : 'opacity-0 scale-95'}`} 
          />
          
          {/* VIGNETTE OVERLAY */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/60 shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]"></div>

          {!isCameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10">
              <div className="w-12 h-12 border-[3.5px] border-white/5 border-t-white rounded-full animate-spin"></div>
              <p className="mt-6 text-[8px] font-black text-white/20 uppercase tracking-[6px]">Initializing Optic</p>
            </div>
          )}

          {showFlash && <div className="absolute inset-0 bg-white z-[60] animate-out fade-out duration-300"></div>}

          {/* DYNAMIC BIOMETRIC HUD - CENTERED VIEWFINDER */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
             <div className={`w-[80vw] h-[80vw] sm:w-[60vw] sm:h-[60vw] border-[1px] rounded-[64px] relative transition-all duration-700 ${isProcessing ? 'scanning-active border-indigo-500/50 scale-105' : 'border-white/10'}`}>
                
                {/* CYBERPUNK CORNERS */}
                <div className="absolute -top-[2px] -left-[2px] w-16 h-16 border-t-[5px] border-l-[5px] border-indigo-500 rounded-tl-[42px] shadow-[0_0_20px_rgba(99,102,241,0.4)]"></div>
                <div className="absolute -top-[2px] -right-[2px] w-16 h-16 border-t-[5px] border-r-[5px] border-indigo-500 rounded-tr-[42px] shadow-[0_0_20px_rgba(99,102,241,0.4)]"></div>
                <div className="absolute -bottom-[2px] -left-[2px] w-16 h-16 border-b-[5px] border-l-[5px] border-indigo-500 rounded-bl-[42px] shadow-[0_0_20px_rgba(99,102,241,0.4)]"></div>
                <div className="absolute -bottom-[2px] -right-[2px] w-16 h-16 border-b-[5px] border-r-[5px] border-indigo-500 rounded-br-[42px] shadow-[0_0_20px_rgba(99,102,241,0.4)]"></div>
                
                {/* ANIMATED SCANNING BAR */}
                {isProcessing && (
                  <div className="absolute inset-x-12 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_30px_#818cf8] animate-[scan_2s_ease-in-out_infinite] opacity-100"></div>
                )}
                
                {/* DATA NODES */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-4 py-1.5 glass rounded-full border border-white/5">
                   <p className="text-[7px] font-black uppercase tracking-[4px] text-white/40 whitespace-nowrap">Subject Alignment Required</p>
                </div>
             </div>
          </div>

          {/* HUD ELEMENTS - POSITIONED RELATIVE TO SCREEN */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-12 z-30 opacity-40">
             <div className="flex justify-between items-start">
                <div className="space-y-1">
                   <div className="w-8 h-[1px] bg-white/20"></div>
                   <p className="text-[7px] font-mono text-white/30 uppercase tracking-widest">FPS: 30.0</p>
                </div>
                <div className="space-y-1 text-right">
                   <div className="w-8 h-[1px] bg-white/20 ml-auto"></div>
                   <p className="text-[7px] font-mono text-white/30 uppercase tracking-widest">RES: 1080P</p>
                </div>
             </div>
             
             <div className="flex justify-between items-end pb-32">
                <div className="space-y-1">
                   <p className="text-[7px] font-mono text-white/30 uppercase tracking-widest">SEC_LVL: ALPHA</p>
                   <div className="w-8 h-[1px] bg-white/20"></div>
                </div>
                <div className="space-y-1 text-right">
                   <p className="text-[7px] font-mono text-white/30 uppercase tracking-widest">ISO: AUTO</p>
                   <div className="w-8 h-[1px] bg-white/20 ml-auto"></div>
                </div>
             </div>
          </div>

          {/* TRIGGER BUTTON AREA */}
          <div className="absolute bottom-36 left-0 right-0 flex flex-col items-center gap-8 z-40">
            <button
              onClick={captureFrame}
              disabled={isProcessing || !isCameraReady}
              className={`w-32 h-32 rounded-full flex items-center justify-center transition-all p-2 relative group ${isProcessing || !isCameraReady ? 'opacity-40 pointer-events-none' : 'active:scale-90'}`}
            >
               {/* OUTER PULSE RING */}
               <div className={`absolute inset-0 rounded-full border-[1.5px] transition-all duration-500 ${isProcessing ? 'border-indigo-500 animate-spin border-t-transparent' : 'border-white/10 group-hover:border-white/30'}`}></div>
               <div className={`absolute inset-2 rounded-full border-[1.5px] transition-all duration-700 ${isProcessing ? 'border-indigo-400 animate-[spin_3s_linear_infinite] border-b-transparent' : 'border-white/5'}`}></div>
               
               {/* INNER CORE */}
               <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-[0_0_40px_rgba(0,0,0,0.5)] ${isProcessing ? 'bg-slate-900' : 'bg-white'}`}>
                 {isProcessing ? (
                   <div className="w-8 h-8 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
                 ) : (
                   <div className="w-12 h-12 border-[1.5px] border-black/10 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-black/5"></div>
                   </div>
                 )}
               </div>
            </button>
            <div className="glass-dark px-10 py-3.5 rounded-[24px] border border-white/5 shadow-2xl flex items-center gap-3">
              <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-indigo-400 animate-pulse' : 'bg-white/20'}`}></div>
              <p className="text-[10px] font-black uppercase tracking-[5px] text-white/80">{isProcessing ? 'Processing Biometrics' : 'Confirm Identity'}</p>
            </div>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};
