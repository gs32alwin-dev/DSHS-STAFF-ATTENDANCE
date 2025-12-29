import { GoogleGenAI, Type, Modality } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async identifyStaff(probeImageBase64: string, staffList: StaffMember[]): Promise<RecognitionResult> {
    try {
      const parts: any[] = [];

      // Add reference images from the staff list
      staffList.forEach((staff) => {
        if (staff.avatarUrl.startsWith('data:image')) {
          const base64Data = staff.avatarUrl.split(',')[1];
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          });
          parts.push({ text: `Person: ${staff.name}, ID: ${staff.id}, Role: ${staff.role}` });
        }
      });

      parts.push({
        text: `
          TASK: Match the person in the FINAL image with one of the reference people provided above.
          Only identify if you are very confident (85%+).
          
          Return JSON:
          {
            "identified": boolean,
            "staffId": "string",
            "staffName": "string",
            "confidence": number,
            "message": "string"
          }
        `
      });

      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: probeImageBase64
        }
      });

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              identified: { type: Type.BOOLEAN },
              staffId: { type: Type.STRING },
              staffName: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              message: { type: Type.STRING }
            },
            required: ["identified", "confidence", "message"]
          }
        }
      });

      return JSON.parse(response.text || '{}') as RecognitionResult;
    } catch (error) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }

  async generateSpeech(text: string): Promise<Uint8Array | null> {
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return this.decodeBase64(base64Audio);
      }
      return null;
    } catch (error) {
      console.error("TTS Error:", error);
      return null;
    }
  }

  private decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number = 24000,
    numChannels: number = 1,
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  async testConnection(url: string): Promise<{ success: boolean; message: string }> {
    if (!url) return { success: false, message: "URL is empty" };
    try {
      // Add a cache buster and explicit redirect following
      const testUrl = `${url}${url.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`;
      const response = await fetch(testUrl, { 
        method: 'GET', 
        mode: 'cors',
        cache: 'no-store',
        redirect: 'follow'
      });
      if (response.ok) return { success: true, message: "Connected successfully!" };
      return { success: false, message: `Server error: ${response.status}` };
    } catch (err) {
      console.error("Fetch test failed:", err);
      return { success: false, message: "Network error. Check if 'Who has access' is set to 'Anyone' in Apps Script." };
    }
  }

  async syncToGoogleSheets(record: AttendanceRecord, webhookUrl: string | null) {
    if (!webhookUrl) return { success: false };
    try {
      // Use no-cors for POST to bypass CORS redirect issues with Google Scripts
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_record', data: record }),
      });
      return { success: true };
    } catch (error) {
      console.error("Sync Error:", error);
      throw error;
    }
  }

  async fetchCloudData(webhookUrl: string) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return null;
    try {
      const fetchUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_data&t=${Date.now()}`;
      const response = await fetch(fetchUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        redirect: 'follow'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
         throw new Error("Access Blocked: Ensure Apps Script is deployed with 'Anyone' access.");
      }
      throw error;
    }
  }

  async syncStaffToCloud(staff: StaffMember, webhookUrl: string) {
    if (!webhookUrl) return;
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_staff', data: staff }),
      });
    } catch (error) {
      console.error("Staff Cloud Sync Error:", error);
    }
  }
}

export const geminiService = new GeminiService();