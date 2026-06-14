import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  emailType?: "notification" | "health-reminder" | "system-alert" | "welcome" | "report";
}

function sign(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const keyBytes = new Uint8Array(key);
  const msgBytes = new Uint8Array(msg);
  return crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then(k => crypto.subtle.sign("HMAC", k, msgBytes.buffer as ArrayBuffer))
    .then(s => new Uint8Array(s));
}

async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: Uint8Array): string {
  return [...buf].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  const enc = new TextEncoder();
  let k = await sign(enc.encode("AWS4" + key), enc.encode(dateStamp));
  k = await sign(k, enc.encode(region));
  k = await sign(k, enc.encode(service));
  k = await sign(k, enc.encode("aws4_request"));
  return k;
}

async function sendSESEmail(request: EmailRequest) {
  const accessKeyId = Deno.env.get("AWS_SES_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY");
  const region = Deno.env.get("AWS_SES_REGION") || "us-east-1";
  const senderEmail = Deno.env.get("AWS_SES_SENDER_EMAIL");

  if (!accessKeyId || !secretAccessKey || !senderEmail) {
    throw new Error("AWS SES credentials not configured");
  }

  const recipients = Array.isArray(request.to) ? request.to : [request.to];
  const toAddresses = recipients.map((e, i) => `Destination.ToAddresses.member.${i + 1}=${encodeURIComponent(e)}`).join("&");

  const params = [
    `Action=SendEmail`,
    toAddresses,
    `Message.Subject.Data=${encodeURIComponent(request.subject)}`,
    `Message.Subject.Charset=UTF-8`,
    `Message.Body.Html.Data=${encodeURIComponent(request.html)}`,
    `Message.Body.Html.Charset=UTF-8`,
    `Source=${encodeURIComponent(senderEmail)}`,
  ];

  if (request.text) {
    params.push(`Message.Body.Text.Data=${encodeURIComponent(request.text)}`);
    params.push(`Message.Body.Text.Charset=UTF-8`);
  }
  if (request.replyTo) {
    params.push(`ReplyToAddresses.member.1=${encodeURIComponent(request.replyTo)}`);
  }

  const body = params.join("&");
  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const service = "ses";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const payloadHash = await sha256(body);
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = toHex(await sign(signingKey, new TextEncoder().encode(stringToSign)));
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Amz-Date": amzDate,
      Authorization: authHeader,
    },
    body,
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error("SES error:", res.status, responseText);
    throw new Error(`SES send failed: ${res.status} - ${responseText}`);
  }

  return { success: true, response: responseText };
}

// Email templates
function getEmailTemplate(type: string, data: Record<string, any> = {}): { subject: string; html: string; text: string } {
  const brandColor = "#1D9E75";
  const appName = "Instaleadsync";
  const footer = `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px;">
      <p>${appName} — Your unified health intelligence platform</p>
      <p><a href="https://instaleadsync.com" style="color:${brandColor};">instaleadsync.com</a></p>
    </div>`;

  const wrap = (content: string, subject: string, textContent: string) => ({
    subject,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align:center;margin-bottom:24px;">
            <h2 style="color:${brandColor};margin:0;font-size:24px;">${appName}</h2>
          </div>
          ${content}
          ${footer}
        </div>
      </div>
    </body></html>`,
    text: textContent,
  });

  switch (type) {
    case "welcome":
      return wrap(
        `<h1 style="color:#111;font-size:20px;">Welcome to ${appName}, ${data.name || "there"}! 🎉</h1>
        <p style="color:#374151;line-height:1.6;">Your unified health journey starts now. Track your nutrition, exercise, sleep, fasting, and more — all in one place.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="https://instaleadsync.com" style="background:${brandColor};color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Get Started</a>
        </div>`,
        `Welcome to ${appName}!`,
        `Welcome to ${appName}, ${data.name || "there"}! Your unified health journey starts now.`
      );

    case "health-reminder":
      return wrap(
        `<h1 style="color:#111;font-size:20px;">${data.title || "Health Reminder"} 💧</h1>
        <p style="color:#374151;line-height:1.6;">${data.message || "Don't forget to stay on track with your health goals today!"}</p>
        ${data.stats ? `<div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#166534;margin:0;font-size:14px;">${data.stats}</p>
        </div>` : ""}`,
        data.title || "Health Reminder — Instaleadsync",
        `${data.title || "Health Reminder"}: ${data.message || "Stay on track with your health goals!"}`
      );

    case "system-alert":
      return wrap(
        `<h1 style="color:#111;font-size:20px;">⚠️ ${data.title || "System Alert"}</h1>
        <p style="color:#374151;line-height:1.6;">${data.message || "An important update from your health system."}</p>`,
        data.title || "System Alert — Instaleadsync",
        `${data.title || "System Alert"}: ${data.message || "Important update from Instaleadsync."}`
      );

    case "weekly-report":
      return wrap(
        `<h1 style="color:#111;font-size:20px;">Your Weekly Health Report 📊</h1>
        <p style="color:#374151;line-height:1.6;">Here's a summary of your health progress this week:</p>
        ${data.sections ? data.sections.map((s: any) => `
          <div style="border-left:3px solid ${brandColor};padding-left:12px;margin:12px 0;">
            <h3 style="color:#111;margin:0 0 4px;font-size:14px;">${s.title}</h3>
            <p style="color:#6b7280;margin:0;font-size:13px;">${s.value}</p>
          </div>`).join("") : ""}`,
        "Your Weekly Health Report — Instaleadsync",
        `Weekly Health Report: Check your progress on instaleadsync.com`
      );

    case "notification":
    default:
      return wrap(
        `<h1 style="color:#111;font-size:20px;">${data.title || "Notification"}</h1>
        <p style="color:#374151;line-height:1.6;">${data.message || ""}</p>`,
        data.title || "Notification — Instaleadsync",
        `${data.title || "Notification"}: ${data.message || ""}`
      );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { to, subject, html, text, emailType, templateData, templateName } = body;

    let emailContent: { subject: string; html: string; text?: string };

    if (templateName) {
      emailContent = getEmailTemplate(templateName, templateData || {});
    } else if (html && subject) {
      emailContent = { subject, html, text };
    } else {
      return new Response(JSON.stringify({ error: "Provide templateName or subject+html" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Recipient is always the authenticated user — prevents abuse of SES identity
    // for sending arbitrary phishing/spam to third parties. The `to` field is ignored.
    void to;
    const recipientEmail = claimsData.claims.email;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "No recipient email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await sendSESEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      emailType: emailType || templateName || "notification",
    });

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("send-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
