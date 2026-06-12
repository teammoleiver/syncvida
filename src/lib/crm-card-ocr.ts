// Lazy-loaded tesseract.js wrapper for business card OCR.
// Works in-browser (free, no API cost). Worker is created on first scan and reused.
import type { Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const w = await createWorker("eng");
      return w;
    })();
  }
  return workerPromise;
}

export async function ocrImage(file: File | Blob | string): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(file as any);
  return data.text ?? "";
}

// Lightweight heuristics — fast offline first pass before any AI call.
export interface ParsedCard {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  website?: string;
  linkedin_url?: string;
  raw_text: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i;
const LINKEDIN_RE = /\b((?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-z0-9_-]+\/?)/i;
const TITLE_HINTS = /\b(ceo|cto|cfo|coo|founder|co-?founder|director|manager|engineer|developer|designer|architect|consultant|sales|marketing|product|chief|head|vp|president|owner|lead|analyst|specialist|coordinator|recruiter)\b/i;

export function parseCardText(text: string): ParsedCard {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedCard = { raw_text: text };

  const emailMatch = text.match(EMAIL_RE); if (emailMatch) out.email = emailMatch[0];
  const phoneMatch = text.match(PHONE_RE); if (phoneMatch) out.phone = phoneMatch[1].trim();
  const liMatch = text.match(LINKEDIN_RE);
  if (liMatch) {
    let u = liMatch[1]; if (!/^https?:/i.test(u)) u = "https://" + u;
    out.linkedin_url = u;
  }
  const urlMatch = text.replace(LINKEDIN_RE, "").match(URL_RE);
  if (urlMatch && !/linkedin/i.test(urlMatch[1])) {
    let u = urlMatch[1]; if (!/^https?:/i.test(u)) u = "https://" + u;
    out.website = u;
  }

  // Title: first line that matches title hints
  const titleLine = lines.find((l) => TITLE_HINTS.test(l) && !EMAIL_RE.test(l));
  if (titleLine) out.title = titleLine;

  // Name: first line that is 2-4 words, mostly letters, not email/url/title
  const nameLine = lines.find((l) =>
    !EMAIL_RE.test(l) && !URL_RE.test(l) && !PHONE_RE.test(l) && l !== titleLine &&
    /^[A-Za-zÀ-ÿ.'-]+(?:\s+[A-Za-zÀ-ÿ.'-]+){1,3}$/.test(l)
  );
  if (nameLine) {
    out.full_name = nameLine;
    const parts = nameLine.split(/\s+/);
    out.first_name = parts[0];
    out.last_name = parts.slice(1).join(" ");
  }

  // Company: line that contains "Inc", "LLC", "Ltd", "GmbH", "Co", or matches the email domain
  const companyLine = lines.find((l) => /\b(inc|llc|ltd|gmbh|co\.?|corp|sa|sas|group|labs|studio|agency|technologies|tech)\b/i.test(l));
  if (companyLine && companyLine !== nameLine && companyLine !== titleLine) out.company = companyLine;
  else if (out.email) {
    const domain = out.email.split("@")[1]?.split(".")[0];
    if (domain && !["gmail", "yahoo", "outlook", "hotmail", "icloud", "proton"].includes(domain.toLowerCase())) {
      out.company = domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  return out;
}

export async function destroyOcrWorker() {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}