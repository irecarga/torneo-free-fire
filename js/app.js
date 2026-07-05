// =========================================================
// app.js — Orquesta el flujo completo de inscripción
// =========================================================
import { supabase, BUCKET_PAGOS } from './supabase-client.js';

const form = document.getElementById('form-inscripcion');
const submitBtn = document.getElementById('submit-btn');
const statusBox = document.getElementById('status-box');
const fileInput = document.getElementById('comprobante');
const fileLabel = document.getElementById('file-label');
const preview = document.getElementById('preview');

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  fileLabel.textContent = file.name;
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
});

function setStatus(message, tone = 'info') {
  const colors = {
    info: 'border-hud text-hud',
    success: 'border-green-400 text-green-400',
    error: 'border-danger text-danger',
    warn: 'border-gold text-gold',
  };
  statusBox.className = `border-l-2 pl-4 py-2 font-tactical text-sm ${colors[tone]}`;
  statusBox.textContent = message;
  statusBox.classList.remove('hidden');
}

function setLoading(isLoading, label = 'Enviar inscripción') {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Procesando…' : label;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nickname = document.getElementById('nickname').value.trim();
  const ff_id = document.getElementById('ff_id').value.trim();
  const whatsapp = document.getElementById('whatsapp').value.trim();
  const file = fileInput.files[0];

  if (!nickname || !ff_id || !whatsapp || !file) {
    setStatus('Completa todos los campos y adjunta tu comprobante.', 'error');
    return;
  }

  try {
    setLoading(true, 'Subiendo comprobante…');
    setStatus('Subiendo tu comprobante de forma segura…', 'info');

    const ext = file.name.split('.').pop();
    const path = `${whatsapp.replace(/\D/g, '')}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_PAGOS)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw new Error(`Error al subir el comprobante: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage.from(BUCKET_PAGOS).getPublicUrl(path);
    const comprobante_url = publicUrlData.publicUrl;

    setLoading(true, 'Registrando inscripción…');
    setStatus('Guardando tu inscripción…', 'info');

    const participanteId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('participantes')
      .insert({ id: participanteId, nickname, ff_id, whatsapp, comprobante_url, estado: 'pendiente' });

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error('Este ID de Free Fire ya está inscrito en el torneo.');
      }
      throw new Error(`Error al registrar: ${insertError.message}`);
    }

    setLoading(true, 'Verificando pago con IA…');
    setStatus('Analizando tu comprobante con IA, esto toma unos segundos…', 'warn');

    const verifyRes = await fetch('/.netlify/functions/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
        participante_id: participanteId,
        comprobante_url,
      }),

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      setStatus(
        'Tu inscripción quedó registrada, pero la verificación automática falló. El staff la revisará manualmente.',
        'warn'
      );
    } else if (verifyData.estado === 'verificado') {
      setStatus('¡Comprobante verificado! Tu cupo en el torneo está confirmado. 🎮', 'success');
      form.reset();
      preview.classList.add('hidden');
      fileLabel.textContent = 'Toca para subir tu captura (JPG / PNG)';
    } else {
      setStatus(
        `Comprobante no válido: ${verifyData.motivo || 'no se detectó un pago válido.'} Puedes volver a intentarlo con otra imagen.`,
        'error'
      );
    }
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Ocurrió un error inesperado. Intenta de nuevo.', 'error');
  } finally {
    setLoading(false);
  }
})
