
export interface StaffMember {
  id: string;
  name: string;
  role: string;
  description?: string;
  avatarUrl: string; // This will store the base64 data for custom registered staff
  isCustom?: boolean;
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  timestamp: string;
  date: string;
  status: 'PRESENT' | 'LATE' | 'ABSENT';
  type: 'SIGN_IN' | 'SIGN_OUT';
  method: 'FACE_RECOGNITION';
}

export interface RecognitionResult {
  identified: boolean;
  staffId?: string;
  staffName?: string;
  confidence: number;
  message: string;
}
