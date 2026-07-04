// =========================================================
// Cliente Supabase (módulo reutilizable)
// =========================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://xrgxbvbzzisyfeweanns.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ADJ6W020CmY8JuFbNNUB8w_4DmPKSnW';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const BUCKET_PAGOS = 'pagos';
