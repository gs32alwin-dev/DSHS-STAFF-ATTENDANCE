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

  useEffect(() => {
    async function setupCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Camera error:", err);
        setError("Camera access required for face recognition. Please enable permissions.");
      }
    }
    setupCamera();

    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

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
      } catch (err) {
        console.error("Analysis failed:", err);
        onResult({ identified: false, confidence: 0, message: "Service temporarily busy. Please try again." });
      }
    }
  }, [isProcessing, onResult, staffList]);

  return (
    <div className="relative w-full max-w-md mx-auto overflow-hidden rounded-[32px] bg-slate-900 aspect-[3/4] shadow-2xl border-4 border-white">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-10 text-center text-slate-300">
          <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-4">
             <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <p className="font-bold">{error}</p>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover grayscale-[20%]"
          />
          
          {/* Recognition HUD Overlay */}
          <div className="absolute inset-0 pointer-events-none">
             <div className="w-full h-full border-[40px] border-black/20">
                <div className={`w-full h-full border-2 rounded-2xl transition-colors duration-500 ${
                  isProcessing ? 'border-amber-400 animate-pulse' : 'border-indigo-400/30'
                }`}>
                   {/* Corner Accents */}
                   <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
                   <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
                   <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
                   <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
                </div>
             </div>
          </div>
          
          <div className="absolute top-6 left-6 flex items-center gap-3">
             <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl text-[10px] text-white font-black uppercase tracking-widest flex items-center gap-2 border border-white/10">
                <span className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                {isProcessing ? 'AI Processing' : 'Scanner Ready'}
             </div>
          </div>

          <button
            onClick={captureFrame}
            disabled={isProcessing}
            className={`absolute bottom-8 left-1/2 -translate-x-1/2 px-10 py-5 rounded-[24px] font-black text-sm tracking-tight transition-all shadow-2xl active:scale-95 flex items-center gap-3
              ${isProcessing 
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed opacity-80' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-500/40'}`}
          >
            {isProcessing ? (
               <>
                 <svg className="animate-spin h-5 w-5 text-indigo-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 Identifying Face...
               </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                Scan My Face
              </>
            )}
          </button>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};