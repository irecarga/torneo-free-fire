// =========================================================
// netlify/functions/verify-payment.js
// =========================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GROQ_MODEL = 'qwen/qwen3.6-27b';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { participante_id, comprobante_url } = JSON.parse(event.body || '{}');

    if (!participante_id || !comprobante_url) {
      return respond(400, { error: 'Faltan participante_id o comprobante_url' });
    }

    const imgResponse = await fetch(comprobante_url);
    if (!imgResponse.ok) {
      throw new Error('No se pudo descargar la imagen del comprobante');
    }
    const arrayBuffer = await imgResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imgResponse.headers.get('content-type') || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${base64}`;

    const prompt = `
Eres un validador automático de comprobantes de pago para la inscripción a un torneo de Free Fire.
Analiza la imagen y responde ÚNICAMENTE con un JSON válido, sin texto adicional, con esta forma exacta:

{"valido": true|false, "motivo": "explicación breve en español"}

Considera "valido: true" solo si la imagen muestra claramente uno de estos elementos:
- Una captura de una app bancaria o billetera digital (transferencia, Yape, Plin, etc.) mostrando un pago EXITOSO o COMPLETADO.
- Un monto, fecha/hora y algún identificador de operación o número de transacción visibles.

Considera "valido: false" si:
- La imagen no es un comprobante de pago (memes, capturas de juego, fotos sin relación, etc.).
- El comprobante muestra un pago PENDIENTE, FALLIDO o RECHAZADO.
- La imagen está borrosa, incompleta o no permite confirmar los datos clave.
- Hay señales de edición/manipulación evidentes.

Responde solo el JSON.
`.trim();

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
  model: GROQ_MODEL,
  temperature: 0,
  max_tokens: 300,
  reasoning_effort: 'none',
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    },
  ],
}),
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Groq API error: ${groqRes.status} ${errText}`);
    }

    const groqData = await groqRes.json();
    const rawText = groqData.choices?.[0]?.message?.content?.trim() || '{}';

    let parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { valido: false, motivo: 'La IA no devolvió un formato válido, revisión manual requerida.' };
    }

    const nuevoEstado = parsed.valido ? 'verificado' : 'rechazado';

    const { error: updateError } = await supabaseAdmin
      .from('participantes')
      .update({ estado: nuevoEstado, motivo_ia: parsed.motivo || null })
      .eq('id', participante_id);

    if (updateError) throw new Error(`Error actualizando Supabase: ${updateError.message}`);

    return respond(200, { estado: nuevoEstado, motivo: parsed.motivo });
  } catch (err) {
    console.error('verify-payment error:', err);
    return respond(500, { error: err.message || 'Error interno del servidor' });
  }
};

function respond(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  };
}
