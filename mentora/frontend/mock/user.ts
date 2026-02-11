export type MockUser = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  university: string;
  personality: string;
  streakDays: number;
  focusLevel: string;
  mostProductiveTime: string;
  consistency: string;
};

export const mockUser: MockUser = {
  firstName: "Berfin",
  lastName: "Örtülü",
  username: "berfinortulu",
  email: "berfin.ortulu@ug.bilkent.edu.tr",
  phone: "+90 5xx xxx xx xx",
  university: "Bilkent University",
  personality: "Analytical - Focused - Calm",
  streakDays: 12,
  focusLevel: "High",
  mostProductiveTime: "Evening",
  consistency: "High",
};

