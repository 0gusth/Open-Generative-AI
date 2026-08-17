/**
 * Format API and studio error messages into clean, user-friendly strings.
 */
export function formatErrorMessage(err, fallback = "Generation failed") {
  if (!err) return fallback;
  let message = typeof err === 'string' ? err : (err.message || fallback);

  // HTTP status carried on the error object beats sniffing digits out of text
  // (UUIDs and URLs in messages routinely contain "402"-like sequences).
  const status = typeof err?.status === 'number' ? err.status : null;
  const hasCode = (code) =>
    status !== null ? status === code : new RegExp(`\\b${code}\\b`).test(message);

  // Parse a JSON payload only when the message IS one — bare, or after the
  // technical prefix (e.g. `API Request Failed: 402 Payment Required - {...}`).
  const jsonCandidate = message.replace(/^API Request Failed: \d+ [^-]+ - /, '').trim();
  if (jsonCandidate.startsWith('{')) {
    try {
      const data = JSON.parse(jsonCandidate);
      if (data.detail && typeof data.detail === 'string') {
        return data.detail;
      }
      if (data.error?.message && typeof data.error.message === 'string') {
        return data.error.message;
      }
      if (data.message && typeof data.message === 'string') {
        return data.message;
      }
    } catch {
      // Ignore JSON parse error
    }
  }

  // Provider content moderation — translate the verdict into what to DO.
  // ByteDance's filter reads the whole prompt; proper names, brands and
  // celebrity/IP references are the usual triggers.
  if (/content moderation|invalid content|flagged/i.test(message)) {
    return /copyright/i.test(message)
      ? "A moderação do provedor bloqueou por possível conteúdo protegido (copyright). Gatilho comum: nomes próprios de personagens, marcas ou obras no prompt. Troque nomes por descrições visuais — o Enhance ✦ faz isso — e gere de novo."
      : "A moderação do provedor bloqueou este prompt. Reescreva como uma cena de filme — sem nomes reais, marcas ou termos sensíveis — e tente de novo.";
  }

  // Handle common HTTP error codes
  if (hasCode(402) || /insufficient_?\s?credits/i.test(message)) {
    return "Saldo insuficiente no provedor para este render. Recarregue a conta (ou escolha um modelo/qualidade mais barato) e tente de novo — nada foi cobrado.";
  }
  if (hasCode(401) || hasCode(403)) {
    return "Authentication failed. Please check your account session or API key.";
  }
  if (hasCode(429)) {
    return "Too many requests. Please wait a moment and try again.";
  }

  // Strip technical prefix like "API Request Failed: 500 Internal Server Error -"
  message = message.replace(/^API Request Failed: \d+ [^-]+ - /, '');

  return message.length > 150 ? message.slice(0, 147) + '...' : message;
}
