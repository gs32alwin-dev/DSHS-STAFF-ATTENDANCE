import { GoogleGenAI, Type, Modality } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  async identifyStaff(probeImageBase64: string, staffList: StaffMember[]): Promise<RecognitionResult> {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("Missing Gemini API Key.");
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const parts: any[] = [];

      const validStaff = staffList.filter(s => s.avatarUrl && s.avatarUrl.includes('base64,'));

      if (validStaff.length === 0) {
        return {
          identified: false,
          confidence: 0,
          message: "No registered staff found with photos."
        };
      }

      validStaff.forEach((staff) => {
        const mimeType = staff.avatarUrl.split(';')[0].split(':')[1] || 'image/jpeg';
        const base64Data = staff.avatarUrl.split(',')[1];
        
        parts.push({
          inlineData: { mimeType, data: base64Data }
        });
        parts.push({ text: `STAFF - ID: ${staff.id}, Name: ${staff.name}, Role: ${staff.role}` });
      });

      parts.push({
        text: `IDENTIFICATION TASK: Compare the last image provided (PROBE) with the REFERENCE images above.
               If you find a clear match (confidence > 0.85), identify the person.
               Return JSON: { "identified": boolean, "staffId": string, "staffName": string, "confidence": number, "message": string }`
      });

      parts.push({
        inlineData: { mimeType: 'image/jpeg', data: probeImageBase64 }
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
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

      const text = response.text;
      if (!text) throw new Error("AI response was empty.");
      return JSON.parse(text) as RecognitionResult;
    } catch (error: any) {
      console.error("Gemini Error:", error);
      if (error.message?.includes("500") || error.message?.includes("Internal error")) {
        throw new Error("AI service is currently busy. Please try again in a few seconds.");
      }
      throw error;
    }
  }

  async generateSpeech(text: string): Promise<Uint8Array | null> {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return null;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
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
      if (base64Audio) return this.decodeBase64(base64Audio);
      return null;
    } catch (error) {
      console.error("TTS Error:", error);
      return null;
    }
  }

  private decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number = 24000, numChannels: number = 1): Promise<AudioBuffer> {
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
    if (!url) return { success: false, message: "URL required" };
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`, { 
        method: 'GET', mode: 'cors', cache: 'no-store', redirect: 'follow'
      });
      return response.ok ? { success: true, message: "Connected!" } : { success: false, message: `Status: ${response.status}` };
    } catch (err) {
      return { success: false, message: "Connection failed. Check your Apps Script deployment." };
    }
  }

  async syncToGoogleSheets(record: AttendanceRecord, webhookUrl: string | null) {
    if (!webhookUrl) return { success: false };
    try {
      await fetch(webhookUrl, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_record', data: record }),
      });
      return { success: true };
    } catch (error) {
      console.error("Sync error:", error);
      throw error;
    }
  }

  async syncStaffToCloud(staff: StaffMember, webhookUrl: string | null) {
    if (!webhookUrl) return { success: false };
    try {
      await fetch(webhookUrl, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_staff', data: staff }),
      });
      return { success: true };
    } catch (error) {
      console.error("Staff sync error:", error);
      throw error;
    }
  }

  async fetchCloudData(webhookUrl: string) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return null;
    try {
      const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_data&t=${Date.now()}`, {
        method: 'GET', mode: 'cors', cache: 'no-store', redirect: 'follow'
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error("Fetch cloud data error:", error);
      return null;
    }
  }
}

export const geminiService = new GeminiService();