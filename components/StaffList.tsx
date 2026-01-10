
import React from 'react';
import { StaffMember } from '../types';

interface StaffListProps {
  staffList: StaffMember[];
  onDelete?: (id: string) => void;
}

export const StaffList: React.FC<StaffListProps> = ({ staffList, onDelete }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
           <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
           <h3 className="text-sm font-black text-white/90 uppercase tracking-[4px]">Authorized Personnel</h3>
        </div>
        <div className="px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
           <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{staffList.length} Active Records</span>
        </div>
      </div>

      {staffList.length === 0 ? (
        <div className="py-24 text-center bg-white/5 border border-white/5 rounded-[48px] flex flex-col items-center justify-center p-12">
           <div className="w-20 h-20 bg-indigo-500/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
             <svg className="w-10 h-10 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
           </div>
           <p className="text-[10px] font-black uppercase tracking-[6px] text-white/20">Empty Directory</p>
           <p className="text-[8px] font-bold text-white/10 uppercase tracking-[3px] mt-2">No identities enrolled in local system</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {staffList.map((staff) => (
            <div key={staff.id} className="group flex items-center gap-6 p-6 bg-white/5 border border-white/5 rounded-[32px] hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-300 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="flex-shrink-0 relative z-10">
                {staff.avatarUrl ? (
                  <img src={staff.avatarUrl} alt={staff.name} className="w-16 h-16 rounded-[22px] object-cover ring-2 ring-white/10 shadow-xl group-hover:ring-indigo-500/50 transition-all" />
                ) : (
                  <div className="w-16 h-16 rounded-[22px] bg-slate-900 flex items-center justify-center text-xl font-black text-white/20 uppercase ring-1 ring-white/5">
                    {staff.name.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex-grow min-w-0 relative z-10">
                <div className="flex items-center gap-3 mb-1">
                   <h4 className="text-lg font-black text-white tracking-tight truncate">{staff.name}</h4>
                   <span className="hidden sm:inline-block px-3 py-1 bg-white/5 rounded-full text-[8px] font-black text-indigo-400 uppercase tracking-widest border border-white/10">ID: {staff.id}</span>
                </div>
                <div className="flex items-center gap-2">
                   <p className="text-[10px] text-white/40 font-bold uppercase tracking-[2px] truncate">{staff.role}</p>
                   <span className="sm:hidden text-[9px] font-mono text-indigo-500/50">#{staff.id}</span>
                </div>
              </div>

              {onDelete && (
                <button 
                  onClick={() => onDelete(staff.id)}
                  className="flex-shrink-0 p-4 text-white/10 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all relative z-10 active:scale-90"
                  title="Purge Identity"
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
