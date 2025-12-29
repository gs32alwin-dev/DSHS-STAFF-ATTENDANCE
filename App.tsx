
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CameraScanner } from './components/CameraScanner';
import { AttendanceCard } from './components/AttendanceCard';
import { StaffRegistration } from './components/StaffRegistration';
import { SheetConfig } from './components/SheetConfig';
import { AttendanceRecord, RecognitionResult, StaffMember } from './types';
import { geminiService } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'registration' | 'settings'>('attendance');
  const [clockMode, setClockMode] = useState<'SIGN_IN' | 'SIGN_OUT'>('SIGN_IN');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [flicker, setFlicker] = useState<'SIGN_IN' | 'SIGN_OUT' | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Persistence: Load data on mount
  useEffect(() => {
    const savedStaff = localStorage.getItem('facetrack-v1-staff');
    if (savedStaff) setStaffList(JSON.parse(savedStaff));

    const savedHistory = localStorage.getItem('facetrack-v1-history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const savedUrl = localStorage.getItem('facetrack-v1-webhook');
    if (savedUrl) setWebhookUrl(savedUrl);
  }, []);

  // REAL-TIME SYNC LOGIC
  const fetchFromCloud = useCallback(async () => {
    if (!webhookUrl || isSyncing) return;
    
    setIsSyncing(true);
    try {
      const cloudData = await geminiService.fetchCloudData(webhookUrl);
      if (cloudData) {
        if (cloudData.history) {
          setHistory(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const newRecords = cloudData.history.filter((r: any) => !existingIds.has(r.id));
            return [...newRecords, ...prev].sort((a, b) => new Date(b.date + ' ' + b.timestamp).getTime() - new Date(a.date + ' ' + a.timestamp).getTime());
          });
        }
        if (cloudData.staff) {
          setStaffList(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newStaff = cloudData.staff.filter((s: any) => !existingIds.has(s.id));
            return [...prev, ...newStaff];
          });
        }
        setLastSync(new Date());
      }
    } catch (err) {
      console.warn("Sync temporarily unavailable.");
    } finally {
      setIsSyncing(false);
    }
  }, [webhookUrl, isSyncing]);

  useEffect(() => {
    if (webhookUrl) {
      fetchFromCloud();
      const interval = setInterval(fetchFromCloud, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [webhookUrl, fetchFromCloud]);

  useEffect(() => localStorage.setItem('facetrack-v1-staff', JSON.stringify(staffList)), [staffList]);
  useEffect(() => localStorage.setItem('facetrack-v1-history', JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem('facetrack-v1-webhook', webhookUrl), [webhookUrl]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const triggerFlicker = (type: 'SIGN_IN' | 'SIGN_OUT') => {
    setFlicker(type);
    setTimeout(() => setFlicker(null), 300);
  };

  const playGreeting = async (name: string, type: 'SIGN_IN' | 'SIGN_OUT') => {
    const text = type === 'SIGN_IN' 
      ? `Hi ${name}, welcome! glad you are here.` 
      : `Goodbye ${name}, thank you for your hard work.`;

    const audioData = await geminiService.generateSpeech(text);
    if (audioData) {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        const audioBuffer = await geminiService.decodeAudioData(audioData, ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
      } catch (err) {
        console.warn("Audio playback failed", err);
      }
    }
  };

  const handleRegister = async (newStaff: StaffMember) => {
    if (staffList.some(s => s.id === newStaff.id)) {
      setToast({ message: `Staff ID ${newStaff.id} already exists!`, type: 'error' });
      return;
    }
    setStaffList(prev => [...prev, newStaff]);
    
    if (webhookUrl) {
      await geminiService.syncStaffToCloud(newStaff, webhookUrl);
      setToast({ message: `${newStaff.name} registered and synced!`, type: 'success' });
    } else {
      setToast({ message: `${newStaff.name} registered locally.`, type: 'success' });
    }
    setActiveTab('attendance');
  };

  const handleRecognition = useCallback(async (result: RecognitionResult) => {
    if (staffList.length === 0) {
      setToast({ message: "No staff registered. Add staff first.", type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      if (result.identified && result.staffId && result.staffName) {
        const now = new Date();
        const newRecord: AttendanceRecord = {
          id: Math.random().toString(36).substr(2, 9),
          staffId: result.staffId,
          staffName: result.staffName,
          timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: now.toLocaleDateString(),
          status: 'PRESENT',
          type: clockMode,
          method: 'FACE_RECOGNITION'
        };

        setHistory(prev => [newRecord, ...prev]);
        triggerFlicker(clockMode);
        playGreeting(result.staffName, clockMode);

        if (webhookUrl) {
           await geminiService.syncToGoogleSheets(newRecord, webhookUrl);
           setToast({ message: `Success: ${result.staffName} identified.`, type: 'success' });
           fetchFromCloud();
        } else {
           setToast({ message: `Identified: ${result.staffName}`, type: 'info' });
        }
      } else {
        setToast({ message: result.message || "Not recognized. Try again.", type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message || "AI Analysis Failed.", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [staffList, webhookUrl, clockMode, fetchFromCloud]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12 font-sans relative">
      {flicker && (
        <div className={`fixed inset-0 z-[100] pointer-events-none transition-opacity duration-150 ${flicker === 'SIGN_IN' ? 'bg-emerald-500/40' : 'bg-blue-600/40'}`} />
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 leading-none">FaceTrack Pro</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`w-2 h-2 rounded-full ${webhookUrl ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {webhookUrl ? 'Cloud Sync Active' : 'Offline Mode'}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1.5 rounded-2xl">
          {[
            { id: 'attendance', label: 'Scanner' },
            { id: 'registration', label: 'Staff' },
            { id: 'settings', label: 'Cloud' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        {activeTab === 'attendance' && (
          <div className="grid lg:grid-cols-12 gap-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="lg:col-span-7">
              <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-xl text-center relative overflow-hidden">
                <div className="mb-10 inline-flex bg-slate-100 p-1.5 rounded-2xl shadow-inner">
                  <button 
                    onClick={() => setClockMode('SIGN_IN')}
                    className={`px-10 py-4 rounded-xl text-sm font-black transition-all ${clockMode === 'SIGN_IN' ? 'bg-emerald-500 text-white shadow-xl scale-105' : 'text-slate-500'}`}
                  >
                    SIGN IN
                  </button>
                  <button 
                    onClick={() => setClockMode('SIGN_OUT')}
                    className={`px-10 py-4 rounded-xl text-sm font-black transition-all ${clockMode === 'SIGN_OUT' ? 'bg-blue-600 text-white shadow-xl scale-105' : 'text-slate-500'}`}
                  >
                    SIGN OUT
                  </button>
                </div>
                
                <CameraScanner onResult={handleRecognition} isProcessing={isProcessing} staffList={staffList} />
                
                <div className="mt-10 flex items-center justify-center gap-8 border-t border-slate-50 pt-8">
                  <div className="text-left">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">AI Core</p>
                    <p className="text-xs font-bold text-slate-600">Gemini 3 Pro</p>
                  </div>
                  <div className="w-px h-8 bg-slate-100"></div>
                  <div className="text-left">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Sync Info</p>
                    <p className="text-xs font-bold text-slate-600">
                      {lastSync ? `Updated ${lastSync.toLocaleTimeString()}` : 'No Cloud Data'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Activity History</h3>
                </div>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {history.length > 0 ? (
                    history.map(record => <AttendanceCard key={record.id} record={record} />)
                  ) : (
                    <div className="text-center py-24 border-2 border-dashed border-slate-100 rounded-[30px] text-slate-400">
                      <p className="font-bold">No Records</p>
                      <p className="text-[10px] uppercase mt-1">Ready for first scan</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'registration' && (
          <div className="grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <StaffRegistration onRegister={handleRegister} />
            </div>
            <div className="lg:col-span-7 bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl">
              <h3 className="text-2xl font-black text-slate-900 mb-8">Registered Staff</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {staffList.map(staff => (
                  <div key={staff.id} className="bg-slate-50 p-5 rounded-3xl border border-transparent hover:border-indigo-200 transition-all flex items-center gap-4">
                    <img src={staff.avatarUrl} className="w-14 h-14 rounded-2xl object-cover" alt="" />
                    <div>
                      <h4 className="font-black text-slate-900 leading-tight">{staff.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{staff.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto">
            <SheetConfig webhookUrl={webhookUrl} onUrlChange={setWebhookUrl} />
          </div>
        )}
      </main>

      {toast && (
        <div className={`fixed bottom-8 right-8 left-8 md:left-auto md:w-[400px] p-5 rounded-3xl shadow-2xl flex items-center gap-4 z-[60] animate-bounce-in border border-white/20 backdrop-blur-md
          ${toast.type === 'success' ? 'bg-slate-900 text-white' : toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          <p className="text-sm font-black leading-tight">{toast.message}</p>
        </div>
      )}

      <style>{`
        @keyframes bounce-in {
          0% { transform: translateY(100px); opacity: 0; }
          70% { transform: translateY(-10px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-bounce-in { animation: bounce-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
