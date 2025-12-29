
import { StaffMember } from './types';

export const KNOWN_STAFF: StaffMember[] = [
  {
    id: 'ST001',
    name: 'Sarah Jenkins',
    role: 'Senior Developer',
    description: 'Female with light brown hair, often wears dark-rimmed glasses.',
    avatarUrl: 'https://picsum.photos/seed/sarah/200'
  },
  {
    id: 'ST002',
    name: 'Michael Chen',
    role: 'Product Designer',
    description: 'Male with short black hair, clean-shaven, distinctive sharp jawline.',
    avatarUrl: 'https://picsum.photos/seed/michael/200'
  },
  {
    id: 'ST003',
    name: 'Elena Rodriguez',
    role: 'HR Manager',
    description: 'Female with long curly dark hair, typically wears silver earrings.',
    avatarUrl: 'https://picsum.photos/seed/elena/200'
  },
  {
    id: 'ST004',
    name: 'David Wilson',
    role: 'Marketing Lead',
    description: 'Male with a short beard, blue eyes, often wears polo shirts.',
    avatarUrl: 'https://picsum.photos/seed/david/200'
  }
];

export const SYSTEM_PROMPT = `
You are a highly accurate face recognition security assistant. 
Your task is to identify a person in the provided image based on the list of registered staff members.

Staff List:
${KNOWN_STAFF.map(s => `- ${s.name} (ID: ${s.id}): ${s.description}`).join('\n')}

Analyze the image carefully. If you are at least 85% certain it is one of these people, identify them.
Return a JSON object with:
- identified: boolean
- staffId: string (if identified)
- staffName: string (if identified)
- confidence: number (0 to 1)
- message: a short message explaining why (e.g., "Matches Michael Chen's facial features")
`;
