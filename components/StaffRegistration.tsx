
import React, { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { StaffMember } from '../types';

interface StaffRegistrationProps {
  onRegister: (staff: StaffMember) => void;
  staffCount: number;
}

interface Point { x: number; y: number }
interface Area { x: number; y: number; width: number; height: number }

const ROLE_OPTIONS = [
  "Educator",
  "Admin",
  "Support staff"
];

const MAX_STAFF = 100;

export const StaffRegistration: React.FC<StaffRegistrationProps> = ({ onRegister, staffCount }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState(ROLE_OPTIONS[0]);
  const [staffId, setStaffId] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImageToCrop(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const getCroppedImg = async (imageSrc: string, pixelCrop: Area, rotation = 0): Promise<string | null> => {
    try {
      const image = new Image();
      image.src = imageSrc;
      await new Promise((res) => (image.onload = res));
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const size = 512;
      canvas.width = size;
      canvas.height = size;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, size, size
      );

      return canvas.toDataURL('image/jpeg', 0.9);
    } catch (e) { return null; }
  };

  const handleSaveCrop = async () => {
    if (imageToCrop && croppedAreaPixels) {
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels, rotation);
      if (croppedImage) {
        setPhoto(croppedImage);
        setImageToCrop(null);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (staffCount >= MAX_STAFF) {
      alert("Local capacity reached. Enrolled 100 identities.");
      return;
    }
    if (!name || !role || !photo || !staffId) return;
    onRegister({ id: staffId.trim(), name: name.trim(), role: role.trim(), avatarUrl: photo, isCustom: true });
    setName(''); setRole(ROLE_OPTIONS[0]); setStaffId(''); setPhoto(null);
  };

  const isLimitReached = staffCount >= MAX_STAFF;

  return (
    <div className="bg-white/5 border border-white/10 rounded-[40px] p-8 md:p-12 shadow-2xl relative overflow-hidden backdrop-blur-3xl">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] pointer-events-none"></div>
      
      {isLimitReached && (
        <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3">
          <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">Local Identity Capacity Reached (100/100)</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={`space-y-10 ${isLimitReached ? 'opacity-20 pointer-events-none' : ''}`}>
        <div className="flex flex-col items-center gap-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-32 h-32 rounded-[40px] bg-white/5 border-2 border-dashed border-white/10 flex items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group overflow-hidden relative shadow-2xl"
          >
            {photo ? (
              <>
                <img src={photo} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                   <span className="text-white text-[9px] font-black uppercase tracking-widest">Change</span>
                </div>
              </>
            ) : (
              <div className="text-center space-y-2 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-indigo-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Face Scan</p>
              </div>
            )}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          </div>
          <div className="text-center">
             <h3 className="text-sm font-black text-white uppercase tracking-[4px]">Biometric Registration</h3>
             <p className="text-[10px] text-white/30 font-medium">Clear frontal portrait required</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black text-white/30 uppercase tracking-[4px] ml-1">Full Identity Name</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 px-6 py-5 rounded-[24px] border border-white/5 focus:border-indigo-500/50 focus:bg-white/10 outline-none transition-all font-semibold text-white placeholder:text-white/10"
              placeholder="e.g. Johnathan Miller"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-white/30 uppercase tracking-[4px] ml-1">Access Serial (ID)</label>
            <input
              type="text" required value={staffId} onChange={(e) => setStaffId(e.target.value)}
              className="w-full bg-white/5 px-6 py-5 rounded-[24px] border border-white/5 focus:border-indigo-500/50 focus:bg-white/10 outline-none transition-all font-mono text-sm text-white placeholder:text-white/10"
              placeholder="FP-9021"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-white/30 uppercase tracking-[4px] ml-1">Assigned Rank (Role)</label>
            <select
              required value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full bg-white/5 px-6 py-5 rounded-[24px] border border-white/5 focus:border-indigo-500/50 focus:bg-white/10 outline-none transition-all text-sm text-white font-semibold appearance-none cursor-pointer"
            >
              {ROLE_OPTIONS.map(opt => (
                <option key={opt} value={opt} className="bg-slate-900 text-white">{opt}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={!name || !role || !photo || !staffId || isLimitReached}
          className="w-full py-6 bg-white text-black rounded-[28px] font-black text-xs uppercase tracking-[5px] hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-20 shadow-2xl disabled:pointer-events-none"
        >
          Finalize Enrollment
        </button>
      </form>

      {imageToCrop && (
        <div className="fixed inset-0 z-[1200] bg-[#020617]/95 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-[48px] overflow-hidden shadow-2xl p-8">
            <h4 className="text-center text-[10px] font-black uppercase tracking-[5px] mb-8 text-indigo-400">Align Profile Optics</h4>
            <div className="relative h-[340px] rounded-[40px] overflow-hidden bg-black/40 border border-white/5">
              <Cropper image={imageToCrop} crop={crop} zoom={zoom} rotation={rotation} aspect={1} cropShape="round" onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} />
            </div>
            <div className="mt-10 flex gap-4">
              <button onClick={() => setImageToCrop(null)} className="flex-1 py-5 rounded-2xl bg-white/5 text-white/40 font-black text-[10px] uppercase tracking-widest border border-white/5">Cancel</button>
              <button onClick={handleSaveCrop} className="flex-1 py-5 rounded-2xl bg-white text-black font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95">Save Profile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
