
import React from 'react';
import { AttendanceRecord } from '../types';

interface AttendanceCardProps {
  record: AttendanceRecord;
}

export const AttendanceCard: React.FC<AttendanceCardProps> = ({ record }) => {
  const isSignIn = record.type === 'SIGN_IN';
  
  return (
    <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 flex items-center justify-between transition-all hover:border-indigo-200 hover:bg-white hover:shadow-lg group">
      <div className="flex items-center gap-5">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shadow-md transition-transform group-hover:scale-110 ${isSignIn ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-700'}`}>
          {record.staffName.charAt(0)}
        </div>
        <div>
          <h4 className="text-sm font-black text-slate-900 leading-tight mb-1">{record.staffName}</h4>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{record.timestamp} • {record.staffId}</p>
        </div>
      </div>
      <div className="flex items-center">
        <span className={`text-[9px] px-3 py-1.5 rounded-xl font-black uppercase tracking-[2px] shadow-sm ${isSignIn ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white'}`}>
          {isSignIn ? 'IN' : 'OUT'}
        </span>
      </div>
    </div>
  );
};
