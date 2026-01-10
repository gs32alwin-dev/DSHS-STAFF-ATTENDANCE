
import React from 'react';
import { StaffMember } from '../types';

interface StaffListProps {
  staffList: StaffMember[];
  onDelete?: (id: string) => void;
}

export const StaffList: React.FC<StaffListProps> = ({ staffList, onDelete }) => {
  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-2xl font-black text-white tracking-tighter">Authorized Entities</h3>
        <div className="glass px-4 py-2 rounded-full border border-white/10">
           <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{staffList.length} Units</span>
        </div>
      </div>

      {staffList.length === 0 ? (
        <div className="py-24 text-center glass-dark rounded-[48px] flex flex-col items-center justify-center p-12">
           <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
             <svg className="w-10 h-10 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
           </div>
           <p className="text-[10px] font-black uppercase tracking-[5px] text-white/20">Empty Directory</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {staffList.map((staff) => (
            <div key={staff.id} className="glass-dark p-6 rounded-[36px] flex items-center gap-6 group transition-all hover:bg-white/5 border border-white/5 hover:border-white/10 shadow-2xl">
              <div className="flex-shrink-0 relative">
                <div className="absolute inset-0 bg-indigo-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-full"></div>
                {staff.avatarUrl ? (
                  <img src={staff.avatarUrl} alt={staff.name} className="w-16 h-16 rounded-[24px] object-cover border-2 border-white/5 relative z-10" />
                ) : (
                  <div className="w-16 h-16 rounded-[24px] bg-white/5 flex items-center justify-center text-xl font-black text-white/20 uppercase relative z-10 border border-white/5">{staff.name.charAt(0)}</div>
                )}
              </div>
              <div className="flex-grow min-w-0">
                <h4 className="text-lg font-black text-white tracking-tight truncate mb-0.5">{staff.name}</h4>
                <div className="flex items-center gap-2">
                   <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest truncate">{staff.role}</p>
                   <span className="w-1 h-1 rounded-full bg-white/10"></span>
                   <p className="text-[9px] font-mono text-indigo-400 font-bold tracking-widest">{staff.id}</p>
                </div>
              </div>
              {onDelete && (
                <button 
                  onClick={() => onDelete(staff.id)}
                  className="p-4 text-white/10 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all active:scale-90"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
