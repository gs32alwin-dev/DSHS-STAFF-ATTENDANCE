
import React, { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { StaffMember } from '../types';

interface StaffRegistrationProps {
  onRegister: (staff: StaffMember) => void;
}

interface Point { x: number; y: number }
interface Area { x: number; y: number; width: number; height: number }

export const StaffRegistration: React.FC<StaffRegistrationProps> = ({ onRegister }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
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

      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height
      );

      return canvas.toDataURL('image/jpeg', 0.8);
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
    if (!name || !role || !photo || !staffId) return;
    onRegister({ id: staffId.trim(), name: name.trim(), role: role.trim(), avatarUrl: photo, isCustom: true });
    setName(''); setRole(''); setStaffId(''); setPhoto(null);
  };

  return (
    <div className="glass-dark p-10 rounded-[48px] border border-white/10 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -z-10"></div>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-white/30 uppercase tracking-[4px] ml-1">Identity Name</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:border-indigo-500/50 focus:bg-white/10 outline-none transition-all font-medium text-white placeholder:text-white/10"
              placeholder="Full Name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-white/30 uppercase tracking-[4px] ml-1">Serial ID</label>
              <input
                type="text" required value={staffId} onChange={(e) => setStaffId(e.target.value)}
                className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:border-indigo-500/50 focus:bg-white/10 outline-none transition-all font-mono text-xs text-white placeholder:text-white/10"
                placeholder="ID-001"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-white/30 uppercase tracking-[4px] ml-1">Rank/Role</label>
              <input
                type="text" required value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:border-indigo-500/50 focus:bg-white/10 outline-none transition-all text-sm text-white placeholder:text-white/10"
                placeholder="Manager"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[9px] font-black text-white/30 uppercase tracking-[4px] ml-1">Biometric Profile</label>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all min-h-[220px] group"
          >
            {photo ? (
              <div className="relative group/img">
                <img src={photo} alt="Preview" className="w-32 h-32 object-cover rounded-[40px] border-2 border-white/10 shadow-2xl" />
                <div className="absolute inset-0 bg-black/60 rounded-[40px] opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                   <span className="text-white text-[9px] font-black uppercase tracking-widest">Update</span>
                </div>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-white/5">
                  <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                </div>
                <span className="text-[10px] text-white/40 font-black uppercase tracking-[3px]">Register Face</span>
              </>
            )}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          </div>
        </div>

        <button
          type="submit"
          disabled={!name || !role || !photo || !staffId}
          className="w-full bg-white text-black py-5 rounded-3xl font-black text-xs uppercase tracking-[5px] hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-20 shadow-2xl shadow-white/5"
        >
          Finalize Credentials
        </button>
      </form>

      {imageToCrop && (
        <div className="fixed inset-0 z-[1200] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="glass-dark w-full max-w-sm rounded-[48px] overflow-hidden shadow-2xl p-6">
            <h4 className="text-center text-[10px] font-black uppercase tracking-[5px] mb-6">Profile Alignment</h4>
            <div className="relative h-[300px] rounded-[40px] overflow-hidden bg-black/50 border border-white/10">
              <Cropper image={imageToCrop} crop={crop} zoom={zoom} rotation={rotation} aspect={1} cropShape="round" onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} />
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={() => setImageToCrop(null)} className="flex-1 py-4 px-4 rounded-2xl bg-white/5 text-white/40 font-black text-[10px] uppercase tracking-widest border border-white/5">Cancel</button>
              <button onClick={handleSaveCrop} className="flex-1 py-4 px-4 rounded-2xl bg-white text-black font-black text-[10px] uppercase tracking-widest shadow-xl">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
