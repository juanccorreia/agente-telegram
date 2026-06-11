import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function Config() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['config'], queryFn: () => api.get('/config') });

  const [form, setForm] = useState({
    telegram_token: '',
    anthropic_api_key: '',
    system_prompt: '',
    google_credentials_json: '',
    google_sheet_id: '',
  });

  useEffect(() => {
    if (data) setForm(prev => ({ ...prev, ...data }));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (values) => api.put('/config', values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });

  function set(key) {
    return e => setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  if (isLoading) return <Layout><p>Carregando...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Configurações</h1>
      <div className="max-w-2xl space-y-6">

        <Card>
          <CardHeader><CardTitle className="text-base">Telegram</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Token do Bot</Label>
              <Input type="password" value={form.telegram_token} onChange={set('telegram_token')} placeholder="123456:ABC-..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Anthropic (Claude)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Chave da API</Label>
              <Input type="password" value={form.anthropic_api_key} onChange={set('anthropic_api_key')} placeholder="sk-ant-..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Atendente</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label>System Prompt</Label>
              <Textarea
                value={form.system_prompt}
                onChange={set('system_prompt')}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-500">Use <code>{'{{SLOTS}}'}</code> para injetar os horários disponíveis.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Google Sheets</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>ID da Planilha</Label>
              <Input value={form.google_sheet_id} onChange={set('google_sheet_id')} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
            </div>
            <div className="space-y-1">
              <Label>Credenciais Service Account (JSON)</Label>
              <Textarea
                value={form.google_credentials_json}
                onChange={set('google_credentials_json')}
                rows={6}
                className="font-mono text-xs"
                placeholder='{"type": "service_account", ...}'
              />
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        {mutation.isSuccess && <p className="text-sm text-green-600">Salvo com sucesso!</p>}
      </div>
    </Layout>
  );
}
